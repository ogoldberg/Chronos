/**
 * POST /api/discover — AI-powered event discovery
 */

import { z } from 'zod';
import { getProvider } from '../../providers/index';
import { upsertEvents } from '../../db';
import { DISCOVER_SYSTEM } from '../../prompts';
import { checkRateLimit } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import type { RouteHandler } from '../index';

const discoverSchema = z.object({
  startYear: z.number(),
  endYear: z.number(),
  count: z.number().min(1).max(20).optional().default(10),
  tierId: z.string().optional().default(''),
  existingTitles: z.array(z.string()).max(50).optional().default([]),
});

// Server-side cache to avoid duplicate API calls for the same region
const discoveryCache = new Map<string, { events: any[]; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
const MAX_CACHE_SIZE = 1000;

function pruneCache() {
  if (discoveryCache.size <= MAX_CACHE_SIZE) return;
  const entries = [...discoveryCache.entries()]
    .sort((a, b) => a[1].timestamp - b[1].timestamp);
  const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
  for (const [key] of toRemove) discoveryCache.delete(key);
}

function getEraContext(startYear: number): string {
  const absStart = Math.abs(startYear);
  if (absStart > 1e9) return 'Focus on cosmic and astrophysical events: star formation, galaxy mergers, cosmic structure. Use category "cosmic".';
  if (absStart > 1e8) return 'Focus on geological and planetary events: tectonic activity, mass extinctions, ice ages, atmospheric changes. Use category "geological".';
  if (absStart > 1e6) return 'Focus on evolutionary milestones: species emergence, migration, adaptation, extinction. Use category "evolutionary".';
  if (startYear < -3000) return 'Focus on early human history: tool development, settlement, early agriculture, cultural evolution. Use category "civilization".';
  if (startYear < 1500) return 'Focus on civilizations: empires, trade, religion, philosophy, technology, warfare, art, architecture. Use category "civilization".';
  return 'Focus on modern history: science, technology, politics, culture, social movements, exploration, industry, warfare. Use category "modern".';
}

export function registerDiscoverRoutes(handleRoute: RouteHandler, dbReady: () => boolean) {
  handleRoute('POST', '/api/discover', null, async (body) => {
    if (!checkRateLimit('discover')) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }

    const parsed = validate(discoverSchema, body);
    if (!parsed.success) {
      return { status: 400, data: { error: parsed.error } };
    }
    const { startYear, endYear, existingTitles, count, tierId } = parsed.data;

    // Check cache
    const cacheKey = `${tierId}:${startYear}:${endYear}`;
    const cached = discoveryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return { status: 200, data: { events: cached.events, cached: true } };
    }

    const ai = getProvider();
    const system = DISCOVER_SYSTEM(startYear, endYear, count, getEraContext(startYear), existingTitles);
    const resp = await ai.chat(system, [
      { role: 'user', content: `Generate ${count} historically important events between ${startYear} and ${endYear}. Search the web to verify key facts. Spread them evenly across the entire range.` },
    ], { maxTokens: 3000, webSearch: true });

    const jsonMatch = resp.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      let events: any[];
      try { events = JSON.parse(jsonMatch[0]); }
      catch { return { status: 200, data: { events: [] } }; }
      discoveryCache.set(cacheKey, { events, timestamp: Date.now() });
      pruneCache();

      // Persist to DB
      if (dbReady()) {
        upsertEvents(events.map((e: any, i: number) => ({
          id: `d-${tierId}-${startYear}-${i}`,
          title: e.title, year: e.year, timestamp: e.timestamp || null,
          precision: e.precision || 'year', emoji: e.emoji, color: e.color,
          description: e.description, category: e.category, source: 'discovered',
          zoom_tier: tierId, wiki: e.wiki, lat: e.lat, lng: e.lng,
          geo_type: e.geoType, path: e.path, region: e.region,
        }))).catch(err => console.error('[DB] Persist error:', err.message));
      }
      return { status: 200, data: { events } };
    }
    return { status: 200, data: { events: [] } };
  });
}
