/**
 * Unbrowser client — thin wrapper over /v1/verify for citation
 * validation.
 *
 * Why this exists: Claude's web_search tool fetches pages during its
 * research phase, so the base hallucination rate is lower than pure
 * LLM output, but there's still a class of failure where the model
 * cites a page that exists but doesn't match the claim (wrong title,
 * wrong year, a redirect to a different work, soft-404, paywall).
 * We cross-check every candidate against a real browser render via
 * Unbrowser's /v1/verify endpoint and reject mismatches before
 * returning them to the client.
 *
 * Latency model: first-visit on a fresh URL is 2-6s, subsequent
 * visits drop to ~76ms via Unbrowser's pattern cache. The
 * server-side LRU cache in routes/sources.ts absorbs the first-
 * visit cost per event — every user after the first gets a cached
 * result in <10ms. Disabled by default (opt-in via UNBROWSER_API_KEY)
 * because an unconfigured operator shouldn't pay latency for a
 * validation layer they didn't ask for.
 *
 * History: this module previously called /v1/batch and ran its own
 * client-side title-matching logic (~30 lines). After Unbrowser
 * shipped /v1/verify (which composes browse + signals + extraction
 * + authority + title-match into a single endpoint), we collapsed
 * the wrapper to a thin call-and-shape adapter. The local
 * `titleMatches` helper is gone — Unbrowser does the matching
 * server-side now using the same algorithm we used to use, but
 * with Unicode support and acronym preservation we never had.
 */

/**
 * The shape Chronos's sources route expects from this module.
 * Mirrors the `/v1/verify` per-source result but flattened to the
 * fields the route actually reads.
 */
export interface VerifiedSource {
  url: string;
  /** True if every gating + claim check passed on the verify side. */
  verified: boolean;
  /** Title actually rendered on the page, for diagnostics. */
  extractedTitle: string | null;
  /** True if the URL fetched successfully (any pass on reachability). */
  reachable: boolean;
}

/**
 * The shape Unbrowser's /v1/verify endpoint returns. Only the
 * fields Chronos actually reads — Unbrowser's full response carries
 * extracted metadata, authority, per-check details, etc., which
 * we currently ignore. Future enhancements (richer EventCard
 * display, authority badges) can extend this interface.
 */
interface VerifyResponseSource {
  url: string;
  verified: boolean;
  confidence: number;
  extractedTitle?: string;
  checks?: {
    reachable?: { passed: boolean };
  };
  error?: string;
}

interface VerifyResponse {
  success: boolean;
  data?: {
    results?: VerifyResponseSource[];
  };
  error?: { code: string; message: string };
}

const VERIFY_TIMEOUT_MS = 60_000; // /v1/verify can take 30s per source

/**
 * Resolve the Unbrowser base URL per-call so env changes (including
 * test overrides) take effect without needing a module reload.
 */
function getBaseUrl(): string {
  return process.env.UNBROWSER_BASE_URL || 'https://api.unbrowser.ai';
}

/**
 * True if Unbrowser verification is configured and enabled. When this
 * returns false, callers should skip verification entirely and trust
 * the AI output — the feature is additive, not load-bearing.
 */
export function unbrowserEnabled(): boolean {
  return !!process.env.UNBROWSER_API_KEY;
}

/**
 * Verify a batch of AI-claimed primary source citations via
 * Unbrowser's /v1/verify endpoint. Each input is a {url, claim}
 * tuple; the response includes per-source verification results.
 *
 * The claim object lets Unbrowser run server-side title/year/author
 * cross-checks against the page's structured data. Claims are
 * optional — pass an empty object to just check reachability and
 * the gating signals (soft-404, etc.).
 *
 * On any transport-level failure (network error, timeout, Unbrowser
 * down, missing key) this returns an empty array — the caller
 * treats that as "no verification possible" and falls back to the
 * raw AI output rather than failing the whole request.
 */
export async function verifyClaims(
  claims: Array<{
    url: string;
    title?: string;
    year?: number;
    author?: string;
  }>,
): Promise<VerifiedSource[]> {
  if (!unbrowserEnabled() || claims.length === 0) return [];

  const apiKey = process.env.UNBROWSER_API_KEY!;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    const resp = await fetch(`${getBaseUrl()}/v1/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        sources: claims,
        options: {
          // Lower than Unbrowser's 0.5 default. Reason: AI-generated
          // citation claims for historical works frequently include
          // the full Victorian-era bibliographic subtitle, e.g.
          //
          //   Claimed: "On the Origin of Species by Means of
          //             Natural Selection, or the Preservation of
          //             Favoured Races in the Struggle for Life"
          //   Page:    "On the Origin of Species (1859) - Wikisource"
          //
          // The claim has 12 filterable tokens after stop-word
          // removal; the page has 8. Token overlap is exactly 3
          // ({the, origin, species}) → 3/12 = 0.25. Anything above
          // 0.25 rejects Darwin and every other long-titled
          // historical work hosted on a digital archive.
          //
          // 0.25 is loose enough for these realistic long-vs-short
          // title mismatches while still rejecting unrelated pages
          // (an AI hallucination targeting a different document
          // would have <10% token overlap). Title check stays as
          // one of several overlapping defenses; predating check +
          // archival year check + reachability + soft-404 do the
          // structural correctness work.
          titleThreshold: 0.25,
          // Drop dead pages.
          rejectSoft404: true,
          // Paywall pages still host the content; let the route
          // decide whether to surface them.
          rejectSoftAuth: false,
        },
      }),
      signal: controller.signal,
    });

    if (!resp.ok) return [];

    const json = (await resp.json()) as VerifyResponse;
    const results = json.data?.results ?? [];

    // Unbrowser's /v1/verify returns exactly one result per source in
    // request order. If the lengths don't match, something went wrong
    // at the server layer — return [] so the caller's length-guard
    // falls back to unverified candidates rather than silently
    // treating every claim as unreachable.
    if (results.length !== claims.length) return [];

    // Align by position with the input claims.
    return claims.map((claim, i) => {
      const r = results[i];
      if (r.error) {
        return { url: claim.url, verified: false, extractedTitle: null, reachable: false };
      }
      return {
        url: claim.url,
        verified: r.verified,
        extractedTitle: r.extractedTitle ?? null,
        reachable: r.checks?.reachable?.passed ?? false,
      };
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
