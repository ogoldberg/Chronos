/**
 * GET /api/events — fetch events in a year range
 * GET /api/search — full-text search
 */

import { getEventsInRange, searchEvents } from '../../db';
import { checkRateLimit } from '../middleware/rateLimit';
import type { RouteHandler } from '../index';

export function registerEventsRoutes(handleRoute: RouteHandler, dbReady: () => boolean) {
  handleRoute('GET', '/api/events', null, async (_body, url) => {
    if (!dbReady()) return { status: 503, data: { error: 'Database not available' } };
    const params = new URL(url, 'http://localhost').searchParams;
    const startYear = parseFloat(params.get('start') || '-14000000000');
    const endYear = parseFloat(params.get('end') || '2030');
    const maxSpan = params.has('maxSpan') ? parseFloat(params.get('maxSpan')!) : undefined;
    const limit = parseInt(params.get('limit') || '200', 10);
    const events = await getEventsInRange(startYear, endYear, maxSpan, limit);
    return { status: 200, data: { events } };
  });

  handleRoute('GET', '/api/search', null, async (_body, url) => {
    if (!checkRateLimit('search')) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }
    const params = new URL(url, 'http://localhost').searchParams;
    const q = params.get('q') || '';
    if (!q.trim()) {
      return { status: 400, data: { error: 'Query parameter "q" is required' } };
    }
    const limit = Math.min(parseInt(params.get('limit') || '20', 10), 100);

    if (dbReady()) {
      const events = await searchEvents(q.trim(), limit);
      return { status: 200, data: { events, source: 'database' } };
    }
    return { status: 200, data: { events: [], source: 'none' } };
  });
}
