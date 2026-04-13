/**
 * POST /api/insights — AI-generated era insights
 */

import { z } from 'zod';
import { getProvider } from '../../providers/index';
import { INSIGHTS_SYSTEM } from '../../prompts';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { getCachedInsights, setCachedInsights, upsertEvents } from '../../db';
import type { RouteHandler } from '../index';

/**
 * Bucket the (centerYear, span) pair so nearby views share a cache key.
 * Mirrors the client's own bucketing in InsightsPanel. We quantize
 * centerYear to steps of (span * 0.1) so small drifts within ~10% of
 * the span hit the same bucket, and span itself to the nearest power
 * of 10 so "roughly the same zoom" counts as equivalent.
 */
function insightsBucket(centerYear: number, span: number): string {
  const spanBucket = Math.round(Math.log10(Math.max(span, 1))) ;
  const centerBucket = Math.round(centerYear / Math.max(span * 0.1, 1));
  return `c${centerBucket}:s${spanBucket}`;
}

const insightsSchema = z.object({
  centerYear: z.number(),
  span: z.number(),
  visibleEvents: z.array(z.string()).optional().default([]),
});

/**
 * Strip Anthropic web_search citation markers (<cite index="...">...</cite>)
 * while preserving the inner text. Applied to any user-facing string
 * where the raw model output could include these markers.
 */
function stripCitationTags(s: string): string {
  return s.replace(/<cite\s+index="[^"]*"\s*>/g, '').replace(/<\/cite>/g, '');
}

export function registerInsightsRoutes(handleRoute: RouteHandler, dbReady: () => boolean) {
  handleRoute('POST', '/api/insights', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('insights', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded' } };
    }
    const parsed = validate(insightsSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };
    const { centerYear, span, visibleEvents } = parsed.data;

    // Cache lookup before spending AI budget. Bucket key collapses
    // nearby viewports into the same entry so a user panning slightly
    // doesn't regenerate identical content.
    const bucketKey = insightsBucket(centerYear, span);
    if (dbReady()) {
      try {
        const hit = await getCachedInsights(bucketKey);
        if (hit && hit.insights.length > 0) {
          return { status: 200, data: { ...hit, cached: true } };
        }
      } catch {
        // Cache miss on DB error — fall through to fresh generation.
      }
    }

    const ai = getProvider();
    const resp = await ai.chat(INSIGHTS_SYSTEM, [
      { role: 'user', content: `Time period centered on year ${centerYear} (span: ${span} years). Visible events: ${visibleEvents.join(', ') || 'none'}. Give me 3 fascinating facts about this era, and if any are concretely dateable historical events, include them in an "events" array alongside the facts.` },
    ], { maxTokens: 900, webSearch: true });

    // The new prompt returns an OBJECT with {facts, events}. We still
    // accept the legacy bare-array shape for backwards compat — if we
    // find a top-level `[` first we treat it as just facts.
    const raw = resp.text;
    let facts: string[] = [];
    let events: Array<Record<string, unknown>> = [];

    const objMatch = raw.match(/\{[\s\S]*"facts"\s*:[\s\S]*\}/);
    const arrMatch = raw.match(/\[[\s\S]*\]/);

    if (objMatch) {
      try {
        const parsed = JSON.parse(objMatch[0]);
        if (Array.isArray(parsed.facts)) facts = parsed.facts;
        if (Array.isArray(parsed.events)) events = parsed.events;
      } catch { /* fall through to array form */ }
    }
    if (facts.length === 0 && arrMatch) {
      try {
        const parsed = JSON.parse(arrMatch[0]);
        if (Array.isArray(parsed)) facts = parsed;
      } catch { /* give up */ }
    }

    const cleanFacts = facts.map(s => typeof s === 'string' ? stripCitationTags(s) : String(s));
    const sources = resp.sources || [];

    // Persist insights so future viewers of this bucket hit the cache.
    if (dbReady() && cleanFacts.length > 0) {
      try { await setCachedInsights(bucketKey, cleanFacts, sources); } catch {}
    }

    // Persist any dateable events the prompt surfaced. Fire-and-forget
    // so insights latency isn't gated on the upsert. Events emitted
    // here use the 'insights' source tag so they're distinguishable
    // from chat-discovered or manually-anchored entries.
    if (dbReady() && events.length > 0) {
      const toUpsert = events
        .filter(e => typeof e.title === 'string' && typeof e.year === 'number')
        .map(e => {
          const str = `${String(e.title).trim().toLowerCase()}::${Math.round(Number(e.year) * 1000) / 1000}`;
          let h = 0x811c9dc5;
          for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
          }
          return {
            id: `insights-${(h >>> 0).toString(36)}`,
            title: String(e.title),
            year: Number(e.year),
            emoji: typeof e.emoji === 'string' ? e.emoji : '📌',
            color: typeof e.color === 'string' ? e.color : '#888888',
            description: typeof e.description === 'string' ? e.description : '',
            category: typeof e.category === 'string' ? e.category : 'modern',
            source: 'insights',
            verified: false,
          };
        });
      if (toUpsert.length > 0) {
        upsertEvents(toUpsert).catch(() => {});
      }
    }

    return { status: 200, data: { insights: cleanFacts, sources, cached: false } };
  });
}
