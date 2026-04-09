/**
 * Unbrowser client — thin wrapper over the /v1/batch endpoint for
 * verifying AI-returned primary source URLs.
 *
 * Why this exists: Claude's web_search tool fetches pages during its
 * research phase, so the base hallucination rate is lower than pure
 * LLM output, but there's still a class of failure where the model
 * cites a page that exists but doesn't match the claim (wrong title,
 * wrong year, a redirect to a different work, or a soft-404 page).
 * We cross-check every candidate against a real browser render via
 * Unbrowser and reject mismatches before returning them to the client.
 *
 * Latency model: first-visit is expensive (2-6s full Playwright), but
 * Unbrowser's learning-pattern cache drops subsequent visits to ~76ms.
 * The server-side LRU cache in routes/sources.ts absorbs the first-
 * visit cost per event — every user after the first gets a cached
 * result in <10ms. The feature is disabled by default (opt-in via
 * UNBROWSER_API_KEY) because an unconfigured operator shouldn't pay
 * latency for a validation layer they didn't ask for.
 */

export interface VerifiedSource {
  url: string;
  /** Title as actually rendered on the page. May differ from claimed. */
  extractedTitle: string | null;
  /** True if the URL resolved to a page with content. */
  reachable: boolean;
  /** How long Unbrowser took — useful for logging slow first-visits. */
  loadTimeMs: number;
}

interface BrowseResult {
  success: boolean;
  data?: {
    url: string;
    title?: string;
    metadata?: {
      loadTime?: number;
      tier?: string;
      cached?: boolean;
    };
  };
  error?: { code: string; message: string };
}

interface BatchResponse {
  success: boolean;
  data?: {
    results?: BrowseResult[];
  };
  results?: BrowseResult[];
  error?: { code: string; message: string };
}

const UNBROWSER_BASE = process.env.UNBROWSER_BASE_URL || 'https://api.unbrowser.ai';
const BATCH_TIMEOUT_MS = 30_000;

/**
 * True if Unbrowser verification is configured and enabled. When this
 * returns false, callers should skip verification entirely and trust
 * the AI output — the feature is additive, not load-bearing.
 */
export function unbrowserEnabled(): boolean {
  return !!process.env.UNBROWSER_API_KEY;
}

/**
 * Verify a batch of URLs via Unbrowser's /v1/batch endpoint.
 * Returns one VerifiedSource per input URL, in the same order, so
 * callers can zip them back against the AI output.
 *
 * On any transport-level failure (network error, timeout, Unbrowser
 * down, missing key) this returns an empty array — the caller treats
 * that as "no verification possible" and falls back to the raw AI
 * output rather than failing the whole request.
 */
export async function verifyUrls(urls: string[]): Promise<VerifiedSource[]> {
  if (!unbrowserEnabled() || urls.length === 0) return [];

  const apiKey = process.env.UNBROWSER_API_KEY!;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BATCH_TIMEOUT_MS);

  try {
    const resp = await fetch(`${UNBROWSER_BASE}/v1/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        urls,
        // text + tiny maxChars keeps the response small — we only need
        // the title field for validation, not the body content. Unbrowser
        // still renders the page fully to extract the title accurately.
        options: { contentType: 'text', maxChars: 200 },
      }),
      signal: controller.signal,
    });

    if (!resp.ok) return [];

    const json = (await resp.json()) as BatchResponse;
    // The batch endpoint's response shape has drifted historically —
    // tolerate both `{data: {results}}` and flat `{results}` so this
    // doesn't break if the wrapper layer changes again.
    const results: BrowseResult[] = (json.data?.results ?? json.results ?? []) as BrowseResult[];

    // Align by position with the input URLs. Unbrowser returns results
    // in request order, but if anything goes wrong and the arrays drift
    // out of sync, fall back to a null entry for that index.
    return urls.map((url, i) => {
      const r = results[i];
      if (!r || !r.success || !r.data) {
        return { url, extractedTitle: null, reachable: false, loadTimeMs: 0 };
      }
      return {
        url,
        extractedTitle: r.data.title ?? null,
        reachable: true,
        loadTimeMs: r.data.metadata?.loadTime ?? 0,
      };
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Decide whether a claimed title plausibly matches an extracted page
 * title. We're deliberately loose — the goal is to catch clear hallucin-
 * ations (AI claimed "Origin of Species", page title is "A Brief History
 * of Everything"), not to enforce exact-string matching (page titles
 * routinely include publisher/site suffixes like " - Wikisource", year
 * parentheticals, edition markers, etc.).
 *
 * Algorithm: lowercase both, strip non-alphanumeric, tokenize into
 * 3+-char words, require at least 50% of the AI-claimed words to
 * appear in the extracted title. Empty claimed title → always matches
 * (we trust AI when we have no baseline). Empty extracted title →
 * never matches.
 */
export function titleMatches(claimed: string, extracted: string | null): boolean {
  if (!claimed) return true;
  if (!extracted) return false;
  const tokenize = (s: string): Set<string> =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3),
    );
  const claimedTokens = tokenize(claimed);
  if (claimedTokens.size === 0) return true;
  const extractedTokens = tokenize(extracted);
  let hits = 0;
  for (const t of claimedTokens) {
    if (extractedTokens.has(t)) hits++;
  }
  return hits / claimedTokens.size >= 0.5;
}
