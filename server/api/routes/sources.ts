/**
 * Sources routes:
 *  - POST /api/sources/compare  — AI-powered historiographic comparison
 *  - POST /api/sources/primary  — AI-powered primary source discovery with
 *                                  strict chronology + type enforcement
 */

import { z } from 'zod';
import { getProvider } from '../../providers/index';
import { SOURCE_COMPARISON_SYSTEM, PRIMARY_SOURCES_SYSTEM } from '../../prompts';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { unbrowserEnabled, verifyClaims } from '../../services/unbrowser';
import type { RouteHandler } from '../index';

const SourcesRequestSchema = z.object({
  topic: z.string().min(1, 'Topic is required').max(300, 'Topic must be under 300 characters'),
});

const PrimarySourcesRequestSchema = z.object({
  title: z.string().min(1).max(300),
  year: z.number().finite(),
  description: z.string().max(1000).optional(),
  // sourceClass is sent by the client after classification. We accept the
  // three classes that actually call the endpoint; sentinel/prehistoric
  // never hit the server because the client short-circuits them.
  sourceClass: z.enum(['historical', 'scientific', 'cultural']),
});

/**
 * Shape returned by the AI — validated before being passed to the client.
 * We're strict about the fields we keep and drop anything unexpected. URLs
 * must parse; titles must be non-empty; year (when present) must be a real
 * number. Malformed entries get filtered out rather than erroring the
 * whole request, so a single hallucinated entry can't break the response.
 */
const AISourceSchema = z.object({
  title: z.string().min(1).max(500),
  url: z.string().url().max(1000),
  year: z.number().finite().optional().nullable(),
  author: z.string().max(200).optional().nullable(),
  type: z.enum(['letter', 'newspaper', 'official', 'witness-account', 'scientific-paper', 'legal-document', 'chronicle', 'other']).optional().nullable(),
  relevance: z.string().max(500).optional().nullable(),
});

// Simple LRU-ish cache keyed on normalized (title, year, sourceClass). We
// use a plain Map with a cap and FIFO eviction — primary sources don't
// change often and a few hundred entries is plenty.
interface CachedEntry {
  sources: unknown[];
  at: number;
}
const CACHE_MAX = 500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const primaryCache = new Map<string, CachedEntry>();

function cacheKey(title: string, year: number, cls: string): string {
  return `${cls}::${Math.round(year)}::${title.trim().toLowerCase().slice(0, 200)}`;
}

function cacheGet(key: string): unknown[] | null {
  const hit = primaryCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    primaryCache.delete(key);
    return null;
  }
  // Refresh recency by re-inserting
  primaryCache.delete(key);
  primaryCache.set(key, hit);
  return hit.sources;
}

function cacheSet(key: string, sources: unknown[]): void {
  if (primaryCache.size >= CACHE_MAX) {
    const firstKey = primaryCache.keys().next().value;
    if (firstKey) primaryCache.delete(firstKey);
  }
  primaryCache.set(key, { sources, at: Date.now() });
}

/**
 * Running metrics for /api/sources/primary. Exposed via GET
 * /api/sources/primary/metrics so operators can watch the AI → verified
 * rejection rate over time without adding full observability
 * infrastructure. All counters are process-lifetime — they reset on
 * server restart, which is fine for a "what's my signal looking like
 * right now" diagnostic but NOT a substitute for real metrics. If this
 * becomes load-bearing we'd graduate it to prom-client or OpenTelemetry.
 *
 * - requests: total calls to the endpoint (including cache hits)
 * - cacheHits: served entirely from the 24h LRU cache, no AI call
 * - aiCalls: an AI request was actually dispatched (≠ cacheHits)
 * - aiCandidates: total candidates AI returned across all aiCalls
 * - aiEmpty: AI returned zero candidates (shouldn't happen often)
 * - verifierRuns: unbrowser verification was invoked
 * - verifierDropped: candidates that failed title/reachability check
 * - verifierUnreachable: subset of verifierDropped where URL didn't load
 * - finalSources: total sources returned to clients across all aiCalls
 * - sentinelsBlocked: requests zod-rejected at the boundary (should be
 *   zero in normal operation; non-zero means a client bypassed the
 *   client-side classifier short-circuit)
 */
const metrics = {
  requests: 0,
  cacheHits: 0,
  aiCalls: 0,
  aiCandidates: 0,
  aiEmpty: 0,
  verifierRuns: 0,
  verifierDropped: 0,
  verifierUnreachable: 0,
  finalSources: 0,
  sentinelsBlocked: 0,
};

export function registerSourcesRoutes(handleRoute: RouteHandler) {
  handleRoute('POST', '/api/sources/compare', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('sources', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }

    const validation = validate(SourcesRequestSchema, body);
    if (!validation.success) {
      return { status: 400, data: { error: validation.error } };
    }

    const { topic } = validation.data;
    const ai = getProvider();
    const system = SOURCE_COMPARISON_SYSTEM(topic.trim());

    const resp = await ai.chat(system, [
      { role: 'user', content: `Compare different historical perspectives on: "${topic.trim()}"` },
    ], { maxTokens: 4000, webSearch: true });

    // Try to extract JSON object with perspectives array
    const jsonMatch = resp.text.match(/\{[\s\S]*"perspectives"\s*:\s*\[[\s\S]*\][\s\S]*"consensus"\s*:[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.perspectives?.length) {
          return {
            status: 200,
            data: {
              perspectives: parsed.perspectives,
              consensus: parsed.consensus || '',
            },
          };
        }
      } catch { /* fall through */ }
    }

    // Fallback: try any top-level JSON object
    const fallbackMatch = resp.text.match(/\{[\s\S]*\}/);
    if (fallbackMatch) {
      try {
        const parsed = JSON.parse(fallbackMatch[0]);
        if (parsed.perspectives?.length) {
          return {
            status: 200,
            data: {
              perspectives: parsed.perspectives,
              consensus: parsed.consensus || '',
            },
          };
        }
      } catch { /* fall through */ }
    }

    return { status: 200, data: { perspectives: [], consensus: '' } };
  });

  handleRoute('POST', '/api/sources/primary', null, async (body, _url, reqHeaders) => {
    metrics.requests++;
    if (!checkRateLimit('sources-primary', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }

    const validation = validate(PrimarySourcesRequestSchema, body);
    if (!validation.success) {
      // Clients that bypass the client-side classifier (or send raw
      // sourceClass values) land here. Sentinel/prehistoric rejection
      // is the common case worth tracking separately so we can spot
      // misbehaving integrations.
      if (/sourceClass/i.test(validation.error || '')) {
        metrics.sentinelsBlocked++;
      }
      return { status: 400, data: { error: validation.error } };
    }

    const { title, year, description, sourceClass } = validation.data;

    // Cache lookup before doing any expensive AI work.
    const key = cacheKey(title, year, sourceClass);
    const cached = cacheGet(key);
    if (cached) {
      metrics.cacheHits++;
      return { status: 200, data: { sources: cached, cached: true } };
    }
    metrics.aiCalls++;

    const ai = getProvider();
    const system = PRIMARY_SOURCES_SYSTEM(title, year, description, sourceClass);

    // The user message is just the identifying tuple. The system prompt
    // carries all the enforcement; the user message is kept minimal so
    // prompt-injection via the event title has the smallest possible
    // surface area.
    const userMessage = `Find primary sources for: ${title} (${year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`})`;

    // Per-endpoint model override. Primary source discovery is a narrow,
    // JSON-structured reasoning task with web search — Haiku 4.5 handles
    // it at roughly 1/3 the cost of Sonnet with comparable quality per
    // Anthropic's benchmarks and third-party comparisons. The provider
    // abstraction supports per-call overrides via the `model` option, so
    // other routes keep whatever model the user configured globally.
    //
    // Override via env if you want to force Sonnet (or switch providers):
    //   AI_SOURCES_MODEL=claude-sonnet-4-6-20251001
    // The default is provider-specific and picks a sensible cheap-tier
    // model when we can infer the provider, otherwise it just passes
    // undefined and the provider's global default wins.
    const modelOverride = process.env.AI_SOURCES_MODEL
      || (ai.name === 'anthropic' ? 'claude-haiku-4-5-20251001' : undefined);

    let raw: string;
    try {
      const resp = await ai.chat(system, [{ role: 'user', content: userMessage }], {
        maxTokens: 2000,
        webSearch: true,
        model: modelOverride,
      });
      raw = resp.text;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // AI failure means we don't know — we return an explicit empty list
      // rather than an error, because the UI's "no sources available"
      // state is honest and useful. But we DON'T cache the empty result
      // so a transient failure doesn't poison the cell permanently.
      return { status: 200, data: { sources: [], error: msg } };
    }

    // Extract the JSON object. The prompt tells the model to emit JSON
    // only, but AI providers sometimes wrap it in prose or markdown
    // fences anyway, so we defensively scan for a balanced object.
    const jsonMatch = raw.match(/\{[\s\S]*"sources"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
    if (!jsonMatch) {
      cacheSet(key, []);
      return { status: 200, data: { sources: [] } };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      cacheSet(key, []);
      return { status: 200, data: { sources: [] } };
    }

    const arr = (parsed as { sources?: unknown }).sources;
    if (!Array.isArray(arr)) {
      cacheSet(key, []);
      return { status: 200, data: { sources: [] } };
    }

    // Filter each candidate through the schema individually so one bad
    // entry doesn't drop the whole list. Also enforce sanity constraints
    // that the prompt already asks for but which the model can ignore:
    //  - drop entries whose year is later than the event year (can't be
    //    a primary source for something that hadn't happened yet)
    //  - dedupe by URL
    const seen = new Set<string>();
    const candidates: Array<z.infer<typeof AISourceSchema>> = [];
    for (const c of arr) {
      const result = AISourceSchema.safeParse(c);
      if (!result.success) continue;
      const s = result.data;
      if (seen.has(s.url)) continue;
      seen.add(s.url);
      // Year sanity: a primary source can't PREDATE the event it's
      // supposedly describing (the 1905 essay and 1921 Shaw play that
      // motivated this whole rewrite both fail this check for a 2025
      // event). Forward direction is left alone — legitimate primary
      // sources can legitimately be created decades or centuries after
      // the event for ancient history (Livy, Plutarch, etc.), and the
      // per-type upper bound is handled by the AI via the prompt. 1-year
      // tolerance handles year-boundary and BCE/CE fencepost ambiguity.
      if (typeof s.year === 'number' && s.year < year - 1) continue;
      candidates.push(s);
      if (candidates.length >= 5) break;
    }
    metrics.aiCandidates += candidates.length;
    if (candidates.length === 0) metrics.aiEmpty++;

    // Optional second-pass validation via Unbrowser's /v1/verify
    // endpoint. When configured, we send every candidate {url, title,
    // year} to Unbrowser, which runs a real browser render, projects
    // structured data from the rendered HTML, and applies
    // chronology-aware title/year/author matching plus soft-404
    // detection. Pages where the verification fails are dropped.
    //
    // Disabled by default — without UNBROWSER_API_KEY set, the
    // candidates pass through unchanged and we trust the AI + prompt
    // enforcement alone.
    //
    // Empirical rejection rate observed in earlier testing against
    // the /v1/batch + client-side matching: 4 of 5 candidates for
    // "American Independence" failed verification (3 unreachable
    // URLs, 1 title mismatch), leaving 1 verified National Archives
    // transcription. The /v1/verify endpoint applies the same
    // matching (token-overlap with threshold 0.5) server-side now,
    // plus Unicode-aware tokenization and acronym preservation that
    // the old client-side path didn't have.
    let sources: unknown[] = candidates;
    if (unbrowserEnabled() && candidates.length > 0) {
      metrics.verifierRuns++;
      // Send the full {url, title, year, author} claim tuple to
      // /v1/verify. Unbrowser's archival-year-check heuristic
      // (ogoldberg/ai-first-web-client#252) handles the case where
      // a digital archive page has `datePublished` much later than
      // the original work's authorship year — the year check passes
      // with an "archival match" reason instead of rejecting every
      // legitimate primary source. Author is still skipped because
      // digital archive metadata frequently lists the curator as
      // `author` rather than the original author of the work;
      // that's a separate gap worth fixing server-side eventually.
      const verified = await verifyClaims(
        candidates.map(c => ({
          url: c.url,
          title: c.title,
          year: typeof c.year === 'number' ? c.year : undefined,
        })),
      );
      // verifyClaims returns exactly `candidates.length` results on
      // success or `[]` on transport failure / length mismatch. The
      // empty case falls through and leaves `sources = candidates`
      // unverified, preserving the "transient Unbrowser issue shouldn't
      // drop everything" contract.
      if (verified.length === candidates.length) {
        // Enrich each surviving candidate with the extractedTitle
        // from verifyClaims so the UI can display what Unbrowser
        // actually saw on the page (useful for letting users
        // see that the Wikisource transcription title said
        // "On the Origin of Species (1859) - Wikisource" even
        // though the AI-supplied title was shorter).
        sources = candidates
          .map((c, i) => {
            const v = verified[i];
            if (!v.verified) {
              metrics.verifierDropped++;
              if (!v.reachable) metrics.verifierUnreachable++;
              return null;
            }
            // Merge the extractedTitle onto the candidate. Any
            // candidate that passed verification keeps its AI-
            // supplied metadata plus the new field.
            return { ...c, extractedTitle: v.extractedTitle ?? undefined };
          })
          .filter((s): s is NonNullable<typeof s> => s !== null);
      }
    }

    metrics.finalSources += (sources as unknown[]).length;
    cacheSet(key, sources);
    return { status: 200, data: { sources } };
  });

  /**
   * Lightweight diagnostic endpoint — returns running metrics for
   * /api/sources/primary. Intentionally unauthenticated because the
   * numbers are all counts (no PII, no content). If this is ever
   * exposed publicly in a way where counts themselves are sensitive,
   * gate it on ADMIN_KEY. For now it's the cheapest way to get an
   * "is verification doing anything?" signal without wiring up real
   * observability.
   *
   * Example query: curl http://localhost:5173/api/sources/primary/metrics
   */
  handleRoute('GET', '/api/sources/primary/metrics', null, async () => {
    const aiCalls = metrics.aiCalls;
    const verificationRate =
      metrics.aiCandidates > 0
        ? 1 - metrics.verifierDropped / metrics.aiCandidates
        : null;
    const cacheHitRate =
      metrics.requests > 0 ? metrics.cacheHits / metrics.requests : null;
    const avgCandidatesPerCall = aiCalls > 0 ? metrics.aiCandidates / aiCalls : null;
    const avgFinalPerCall = aiCalls > 0 ? metrics.finalSources / aiCalls : null;
    return {
      status: 200,
      data: {
        ...metrics,
        derived: {
          // Fraction of AI-returned candidates that survived verification.
          // Null until at least one candidate has been seen. Lower numbers
          // mean the AI is producing more hallucinations / broken URLs and
          // Unbrowser is catching them.
          verificationSurvivalRate: verificationRate,
          // Fraction of requests served from the 24h LRU cache without
          // an AI call. Higher is better (cheaper) once the cache warms.
          cacheHitRate,
          avgCandidatesPerAiCall: avgCandidatesPerCall,
          avgFinalSourcesPerAiCall: avgFinalPerCall,
        },
      },
    };
  });
}
