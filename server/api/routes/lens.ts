/**
 * POST /api/lens/discover — discover events through a thematic lens
 */

import { getProvider } from '../../providers/index';
import { upsertEvents } from '../../db';
import { LENS_DISCOVERY_SYSTEM } from '../../prompts';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import type { RouteHandler } from '../index';

export function registerLensRoutes(handleRoute: RouteHandler, dbReady: () => boolean) {
  handleRoute('POST', '/api/lens/discover', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('lens-discover', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }
    const ai = getProvider();
    const { lens, startYear, endYear, count = 8 } = body;
    if (!lens?.name || !lens?.tags || typeof startYear !== 'number' || typeof endYear !== 'number') {
      return { status: 400, data: { error: 'lens (with name, description, tags), startYear, and endYear are required.' } };
    }

    const safeCount = Math.min(Math.max(count, 1), 20);
    const system = LENS_DISCOVERY_SYSTEM(lens, startYear, endYear, safeCount);
    const resp = await ai.chat(system, [
      { role: 'user', content: `Discover ${safeCount} events between ${startYear} and ${endYear} through the "${lens.name}" lens. Focus on: ${lens.tags.slice(0, 15).join(', ')}.` },
    ], { maxTokens: 3000, webSearch: true });

    const jsonMatch = resp.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      let events: any[];
      try { events = JSON.parse(jsonMatch[0]); }
      catch { return { status: 200, data: { events: [] } }; }

      // Persist to DB
      if (dbReady()) {
        upsertEvents(events.map((e: any, i: number) => ({
          id: `lens-${lens.name.replace(/\s+/g, '-').toLowerCase()}-${startYear}-${i}`,
          title: e.title, year: e.year, timestamp: e.timestamp || null,
          precision: e.precision || 'year', emoji: e.emoji, color: e.color,
          description: e.description, category: e.category, source: 'discovered',
          zoom_tier: '', wiki: e.wiki, lat: e.lat, lng: e.lng,
          geo_type: e.geoType, path: e.path, region: e.region,
        }))).catch(err => console.error('[DB] Lens persist error:', err.message));
      }
      return { status: 200, data: { events } };
    }
    return { status: 200, data: { events: [] } };
  });
}
