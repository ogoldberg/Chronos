/**
 * POST /api/discover — DB-first event discovery
 *
 * Flow:
 * 1. Check cache_regions table — has this area been discovered?
 * 2. If yes and not expired → serve from DB
 * 3. If no → call AI, write to DB, mark cache_region
 */

import { z } from 'zod';
import { getProvider, getProviderConfig } from '../../providers/index';
import {
  upsertEvents,
  getEventsInRange,
  getCacheRegion,
  markCacheRegion,
  logDiscovery,
} from '../../db';
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

// In-memory cache (fallback when DB is not available)
const memoryCache = new Map<string, { events: any[]; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24;
const MAX_CACHE_SIZE = 1000;

function pruneMemoryCache() {
  if (memoryCache.size <= MAX_CACHE_SIZE) return;
  const entries = [...memoryCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
  for (const [key] of entries.slice(0, entries.length - MAX_CACHE_SIZE)) memoryCache.delete(key);
}

function getEraContext(startYear: number): string {
  const absStart = Math.abs(startYear);
  if (absStart > 1e9) return 'Focus on cosmic and astrophysical events. Use category "cosmic".';
  if (absStart > 1e8) return 'Focus on geological and planetary events. Use category "geological".';
  if (absStart > 1e6) return 'Focus on evolutionary milestones. Use category "evolutionary".';
  if (startYear < -3000) return 'Focus on early human history. Use category "civilization".';
  if (startYear < 1500) return 'Focus on civilizations: empires, trade, religion, philosophy. Use category "civilization".';
  return 'Focus on modern history: science, technology, politics, culture. Use category "modern".';
}

export function registerDiscoverRoutes(handleRoute: RouteHandler, dbReady: () => boolean) {
  handleRoute('POST', '/api/discover', null, async (body) => {
    if (!checkRateLimit('discover')) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }

    const parsed = validate(discoverSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };
    const { startYear, endYear, existingTitles, count, tierId } = parsed.data;

    const cellIndex = Math.floor(startYear); // Simplified cell index
    const cacheKey = `${tierId}:${startYear}:${endYear}`;

    // ── Phase 1: Check DB (source of truth) ──
    if (dbReady()) {
      try {
        const region = await getCacheRegion(tierId || 'default', cellIndex);
        if (region && new Date(region.expires_at) > new Date()) {
          // Region is covered and not expired — serve from DB
          const events = await getEventsInRange(startYear, endYear, undefined, count * 2);
          if (events.length > 0) {
            return { status: 200, data: { events, source: 'database', cached: true } };
          }
          // Region marked as covered but empty — fall through to AI
        }
      } catch (err: any) {
        console.error('[Discover] DB check failed:', err.message);
        // Fall through to memory cache / AI
      }
    }

    // ── Phase 2: Check memory cache (fallback) ──
    const memCached = memoryCache.get(cacheKey);
    if (memCached && Date.now() - memCached.timestamp < CACHE_TTL) {
      return { status: 200, data: { events: memCached.events, source: 'memory', cached: true } };
    }

    // ── Phase 3: AI discovery ──
    const t0 = Date.now();
    const ai = getProvider();
    const config = getProviderConfig();
    const system = DISCOVER_SYSTEM(startYear, endYear, count, getEraContext(startYear), existingTitles);

    const resp = await ai.chat(system, [
      { role: 'user', content: `Generate ${count} historically important events between ${startYear} and ${endYear}. Search the web to verify key facts. Spread them evenly across the entire range.` },
    ], { maxTokens: 3000, webSearch: true });

    const latencyMs = Date.now() - t0;
    const jsonMatch = resp.text.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      return { status: 200, data: { events: [], source: 'ai' } };
    }

    let events: any[];
    try { events = JSON.parse(jsonMatch[0]); }
    catch { return { status: 200, data: { events: [], source: 'ai' } }; }

    // Cache in memory
    memoryCache.set(cacheKey, { events, timestamp: Date.now() });
    pruneMemoryCache();

    // ── Phase 4: Persist to DB + mark region ──
    if (dbReady()) {
      const dbEvents = events.map((e: any, i: number) => ({
        id: `d-${tierId}-${startYear}-${i}`,
        title: e.title, year: e.year, timestamp: e.timestamp || null,
        precision: e.precision || 'year', emoji: e.emoji, color: e.color,
        description: e.description, category: e.category, source: 'discovered',
        zoom_tier: tierId, wiki: e.wiki, lat: e.lat, lng: e.lng,
        geo_type: e.geoType, path: e.path, region: e.region,
      }));

      // Persist events + mark region + log discovery (all non-blocking)
      Promise.all([
        upsertEvents(dbEvents),
        markCacheRegion(tierId || 'default', cellIndex, startYear, endYear, events.length),
        logDiscovery(tierId || 'default', startYear, endYear, config.provider, config.model, events.length, dbEvents.length, undefined, latencyMs),
      ]).catch(err => console.error('[Discover] DB persist error:', err.message));
    }

    return { status: 200, data: { events, source: 'ai' } };
  });
}
