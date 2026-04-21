/**
 * Today in History routes (free / Wikipedia + Wikidata only)
 *
 * GET  /api/today?month=M&day=D       — curated events from Wikipedia + Wikidata (fast, free)
 * POST /api/today/explore              — all events grouped by theme (Wikipedia)
 *
 * The AI-enriched `/api/today/detail` route moved to the client (direct
 * browser → provider call in `TodayInHistory.tsx`). See the BYOK
 * migration commit for context.
 */

import { z } from 'zod';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { getOnThisDayEvents, getAllOnThisDayEvents } from '../../services/onThisDay';
import type { RouteHandler } from '../index';

const dateSchema = z.object({
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
});

export function registerTodayRoutes(handleRoute: RouteHandler) {
  // ── Fast path: curated events from Wikipedia + Wikidata ────────────
  handleRoute('POST', '/api/today', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('today', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded' } };
    }
    const parsed = validate(dateSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };
    const { month, day } = parsed.data;

    try {
      const { curated, total } = await getOnThisDayEvents(month, day);
      return {
        status: 200,
        data: { events: curated, total, source: 'wikipedia+wikidata' },
      };
    } catch (err: any) {
      console.error('[today] Failed to fetch on-this-day events:', err.message);
      return { status: 500, data: { error: 'Failed to fetch historical events' } };
    }
  });

  // ── Explore: all events grouped by theme ──────────────────────────
  handleRoute('POST', '/api/today/explore', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('today', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded' } };
    }
    const parsed = validate(dateSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };
    const { month, day } = parsed.data;

    try {
      const result = await getAllOnThisDayEvents(month, day);
      return { status: 200, data: result };
    } catch (err: any) {
      console.error('[today/explore] Failed:', err.message);
      return { status: 500, data: { error: 'Failed to fetch events' } };
    }
  });
}
