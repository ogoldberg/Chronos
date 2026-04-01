/**
 * GET /api/events — fetch events in a year range
 * GET /api/search — full-text search
 */

import { z } from 'zod';
import { getEventsInRange, searchEvents } from '../../db';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
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
}
