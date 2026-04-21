/**
 * Public REST API for developers
 *
 * Read-only access to CHRONOS event data.
 * Requires API key via X-API-Key header (uses CHRONOS_PUBLIC_API_KEY env var).
 * Rate limited to 60 req/min per key.
 */

import { getEventsInRange, searchEvents, getNearbyEvents } from '../../db';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import type { RouteHandler } from '../index';

function checkApiKey(headers: Record<string, string | string[] | undefined>): boolean {
  const requiredKey = process.env.CHRONOS_PUBLIC_API_KEY;
  if (!requiredKey) return true; // No key configured = open access
  const provided = headers['x-api-key'];
  return (Array.isArray(provided) ? provided[0] : provided) === requiredKey;
}

export function registerPublicApiRoutes(handleRoute: RouteHandler, isDbReady: () => boolean) {
  // GET /api/v1/events — query events by time range
  handleRoute('GET', '/api/v1/events', null, async (_body, url, reqHeaders) => {
    if (!checkApiKey(reqHeaders || {})) {
      return { status: 401, data: { error: 'Invalid or missing API key. Set X-API-Key header.' } };
    }
    if (!checkRateLimit('public-api', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded (60/min)' } };
    }
    if (!isDbReady()) {
      return { status: 503, data: { error: 'Database not available' } };
    }

    const params = new URL(url, 'http://localhost').searchParams;
    const start = parseFloat(params.get('start') || '-14000000000');
    const end = parseFloat(params.get('end') || '2030');
    const limit = Math.min(parseInt(params.get('limit') || '50', 10), 200);
    const offset = parseInt(params.get('offset') || '0', 10);

    const events = await getEventsInRange(start, end, undefined, limit + offset);
    const paged = events.slice(offset, offset + limit);

    return {
      status: 200,
      data: {
        events: paged.map(e => ({
          id: e.id,
          title: e.title,
          year: e.year,
          timestamp: e.timestamp,
          precision: e.precision,
          description: e.description,
          category: e.category,
          wiki: e.wiki,
          lat: e.lat,
          lng: e.lng,
          confidence: (e as unknown as { confidence?: string }).confidence,
        })),
        total: events.length,
        limit,
        offset,
      },
    };
  });

  // GET /api/v1/search — full-text search
  handleRoute('GET', '/api/v1/search', null, async (_body, url, reqHeaders) => {
    if (!checkApiKey(reqHeaders || {})) {
      return { status: 401, data: { error: 'Invalid or missing API key' } };
    }
    if (!checkRateLimit('public-api', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded' } };
    }
    if (!isDbReady()) {
      return { status: 503, data: { error: 'Database not available' } };
    }

    const params = new URL(url, 'http://localhost').searchParams;
    const q = params.get('q');
    if (!q) return { status: 400, data: { error: 'q parameter required' } };

    const limit = Math.min(parseInt(params.get('limit') || '20', 10), 100);
    const results = await searchEvents(q, limit);

    return {
      status: 200,
      data: {
        results: results.map(e => ({
          id: e.id,
          title: e.title,
          year: e.year,
          description: e.description,
          category: e.category,
          wiki: e.wiki,
        })),
        query: q,
        count: results.length,
      },
    };
  });

  // GET /api/v1/nearby — events near a location
  handleRoute('GET', '/api/v1/nearby', null, async (_body, url, reqHeaders) => {
    if (!checkApiKey(reqHeaders || {})) {
      return { status: 401, data: { error: 'Invalid or missing API key' } };
    }
    if (!checkRateLimit('public-api', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded' } };
    }
    if (!isDbReady()) {
      return { status: 503, data: { error: 'Database not available' } };
    }

    const params = new URL(url, 'http://localhost').searchParams;
    const lat = parseFloat(params.get('lat') || '');
    const lng = parseFloat(params.get('lng') || '');
    if (isNaN(lat) || isNaN(lng)) {
      return { status: 400, data: { error: 'lat and lng parameters required' } };
    }

    const radius = Math.min(parseFloat(params.get('radius') || '5'), 50);
    const limit = Math.min(parseInt(params.get('limit') || '20', 10), 100);
    const results = await getNearbyEvents(lat, lng, radius, limit);

    return {
      status: 200,
      data: {
        results: results.map(e => ({
          id: e.id,
          title: e.title,
          year: e.year,
          description: e.description,
          lat: e.lat,
          lng: e.lng,
        })),
        location: { lat, lng },
        radius,
        count: results.length,
      },
    };
  });
}
