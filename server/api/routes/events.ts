/**
 * GET /api/events — fetch events in a year range
 * GET /api/search — full-text search
 */

import { z } from 'zod';
import { getEventsInRange, searchEvents, upsertEvents } from '../../db';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { discoverRelatedEvents, getCachedEventContext, resolveQID } from '../../services/wikidataGraph';
import type { RouteHandler } from '../index';

const eventsQuerySchema = z.object({
  start: z.coerce.number().optional().default(-14000000000),
  end: z.coerce.number().optional().default(2030),
  maxSpan: z.coerce.number().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(200),
});

const searchQuerySchema = z.object({
  q: z.string().min(1, 'Query parameter "q" is required'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export function registerEventsRoutes(handleRoute: RouteHandler, dbReady: () => boolean) {
  handleRoute('GET', '/api/events', null, async (_body, url) => {
    if (!dbReady()) return { status: 503, data: { error: 'Database not available' } };
    const params = new URL(url, 'http://localhost').searchParams;
    const parsed = validate(eventsQuerySchema, Object.fromEntries(params));
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };
    const { start: startYear, end: endYear, maxSpan, limit } = parsed.data;
    const events = await getEventsInRange(startYear, endYear, maxSpan, limit);
    return { status: 200, data: { events } };
  });

  handleRoute('GET', '/api/search', null, async (_body, url, reqHeaders) => {
    if (!checkRateLimit('search', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }
    const params = new URL(url, 'http://localhost').searchParams;
    const parsedSearch = validate(searchQuerySchema, Object.fromEntries(params));
    if (!parsedSearch.success) return { status: 400, data: { error: parsedSearch.error } };
    const { q, limit } = parsedSearch.data;

    if (dbReady()) {
      const events = await searchEvents(q.trim(), limit);
      return { status: 200, data: { events, source: 'database' } };
    }
    return { status: 200, data: { events: [], source: 'none' } };
  });

  // POST /api/events/ingest — persist AI-generated events (from chat,
  // insights, tours, etc.) to the DB so they survive restarts and appear
  // for future viewers of the same region. The client hands us an array
  // of event-shaped objects after parsing [[EVENTS:...]] from chat or
  // the events[] field from insights. We sanitize, generate stable IDs
  // (hash of title+year), and upsert via the shared path.
  const ingestSchema = z.object({
    source: z.enum(['chat', 'insights', 'tour', 'user']).default('chat'),
    events: z.array(z.object({
      title: z.string().min(1).max(500),
      year: z.number().finite(),
      emoji: z.string().max(8).optional(),
      color: z.string().max(20).optional(),
      description: z.string().max(2000).optional(),
      category: z.string().max(40).optional(),
      wiki: z.string().max(200).optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
      geoType: z.string().max(20).optional(),
      citations: z.array(z.any()).optional(),
      confidence: z.string().max(20).optional(),
      timestamp: z.string().optional(),
      precision: z.string().max(20).optional(),
    })).min(1).max(50),
  });

  handleRoute('POST', '/api/events/ingest', null, async (body, _url, reqHeaders) => {
    if (!dbReady()) return { status: 503, data: { error: 'Database not available' } };
    if (!checkRateLimit('events-ingest', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded' } };
    }
    const parsed = validate(ingestSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };
    const { source, events } = parsed.data;

    // Stable ID from hash(title+year) so re-ingesting the same event
    // upserts instead of duplicating. Simple FNV-1a is enough here —
    // collision resistance isn't load-bearing, we just want the same
    // pair to produce the same key across calls.
    function stableId(title: string, year: number): string {
      const str = `${title.trim().toLowerCase()}::${Math.round(year * 1000) / 1000}`;
      let h = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return `${source}-${(h >>> 0).toString(36)}`;
    }

    const toUpsert = events.map(e => ({
      id: stableId(e.title, e.year),
      title: e.title,
      year: e.year,
      emoji: e.emoji || '📌',
      color: e.color || '#888888',
      description: e.description || '',
      category: e.category || 'modern',
      source,
      wiki: e.wiki,
      lat: e.lat,
      lng: e.lng,
      geo_type: e.geoType,
      citations: e.citations ?? [],
      confidence: e.confidence || 'likely',
      timestamp: e.timestamp,
      precision: e.precision || 'year',
      verified: false,
    }));

    await upsertEvents(toUpsert);
    return { status: 200, data: { ingested: toUpsert.length, ids: toUpsert.map(e => e.id) } };
  });

  // ── POST /api/events/related — discover related events via Wikidata graph ──

  // Tight bounds on wikiTitle: 300 chars is well above any real Wikipedia
  // article length, prevents query ballooning and DoS via huge inputs.
  // Reject control chars at the schema level so they never reach the
  // SPARQL escaper as a defense-in-depth measure.
  const wikiTitleSchema = z.string().min(1).max(300).regex(
    // eslint-disable-next-line no-control-regex
    /^[^\u0000-\u001f\u007f]+$/,
    'Title must not contain control characters',
  );

  const relatedSchema = z.object({
    wikiTitle: wikiTitleSchema,
  });

  handleRoute('POST', '/api/events/related', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('events-related', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded' } };
    }
    const parsed = validate(relatedSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };

    try {
      const related = await discoverRelatedEvents(parsed.data.wikiTitle);
      return { status: 200, data: { related } };
    } catch (err: any) {
      console.error('[events/related] Failed:', err.message);
      return { status: 500, data: { error: 'Failed to discover related events' } };
    }
  });

  // ── POST /api/events/context — full Wikidata graph context for an event ──

  const contextSchema = z.object({
    wikiTitle: wikiTitleSchema,
  });

  handleRoute('POST', '/api/events/context', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('events-context', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded' } };
    }
    const parsed = validate(contextSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };

    try {
      const qid = await resolveQID(parsed.data.wikiTitle);
      if (!qid) return { status: 404, data: { error: 'Event not found in Wikidata' } };

      const context = await getCachedEventContext(qid);
      if (!context) return { status: 404, data: { error: 'No graph data available' } };

      return { status: 200, data: { context } };
    } catch (err: any) {
      console.error('[events/context] Failed:', err.message);
      return { status: 500, data: { error: 'Failed to fetch event context' } };
    }
  });
}
