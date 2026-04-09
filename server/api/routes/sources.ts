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
    if (!checkRateLimit('sources-primary', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }

    const validation = validate(PrimarySourcesRequestSchema, body);
    if (!validation.success) {
      return { status: 400, data: { error: validation.error } };
    }

    const { title, year, description, sourceClass } = validation.data;

    // Cache lookup before doing any expensive AI work.
    const key = cacheKey(title, year, sourceClass);
    const cached = cacheGet(key);
    if (cached) return { status: 200, data: { sources: cached, cached: true } };

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
    const sources: unknown[] = [];
    for (const candidate of arr) {
      const result = AISourceSchema.safeParse(candidate);
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
      sources.push(s);
      if (sources.length >= 5) break;
    }

    cacheSet(key, sources);
    return { status: 200, data: { sources } };
  });
}
