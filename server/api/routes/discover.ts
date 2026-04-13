/**
 * POST /api/discover — DB-first event discovery with Wikidata fallback
 *
 * Flow:
 * 1. Check cache_regions table — has this area been discovered?
 * 2. If yes and not expired -> serve from DB
 * 3. If no -> query Wikidata SPARQL, write to DB, mark cache_region
 *
 * No AI calls — uses structured Wikidata queries for free, fast, accurate
 * event discovery across all time periods.
 */

import { z } from 'zod';
import {
  upsertEvents,
  getEventsInRange,
  getCacheRegion,
  markCacheRegion,
  logDiscovery,
} from '../../db';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
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

function getCategory(startYear: number): string {
  const absStart = Math.abs(startYear);
  if (absStart > 1e9) return 'cosmic';
  if (absStart > 1e8) return 'geological';
  if (absStart > 1e6) return 'evolutionary';
  if (startYear < 1500) return 'civilization';
  return 'modern';
}

function getCategoryColor(category: string): string {
  switch (category) {
    case 'cosmic': return '#a78bfa';
    case 'geological': return '#f59e0b';
    case 'evolutionary': return '#10b981';
    case 'civilization': return '#3b82f6';
    case 'modern': return '#ec4899';
    default: return '#888';
  }
}

// ── Wikidata SPARQL discovery ────────────────────────────────────────

async function discoverFromWikidata(
  startYear: number,
  endYear: number,
  count: number,
  existingTitles: Set<string>,
): Promise<any[]> {
  // Wikidata works best for human-scale history (-3000 to present).
  // For deep time (geological, cosmic), it has limited coverage.
  if (startYear < -10000) return [];

  // Build SPARQL query for events in the year range.
  // Filter to actual event types (not years, centuries, or list articles).
  // Broad coverage across military, political, cultural, scientific, and disaster events.
  const query = `
    SELECT DISTINCT ?event ?eventLabel ?date ?coord ?articleTitle WHERE {
      ?event wdt:P585 ?date .
      ?event wdt:P31 ?type .
      VALUES ?type {
        wd:Q1190554   # occurrence
        wd:Q13418847  # historical event
        wd:Q178561    # battle
        wd:Q198       # war
        wd:Q831663    # military campaign
        wd:Q93288     # treaty
        wd:Q131569    # legislation / act of parliament
        wd:Q35127     # revolution
        wd:Q7278      # political revolution
        wd:Q124757    # riot
        wd:Q2223653   # protest
        wd:Q476300    # epidemic
        wd:Q3839081   # disaster
        wd:Q15275719  # recurring event edition
        wd:Q3505845   # international incident
        wd:Q1006311   # coup d'etat (subclass)
        wd:Q17317604  # expedition
        wd:Q1348589   # political crisis
        wd:Q7283      # terrorism
        wd:Q175331    # mutiny
        wd:Q12184     # pandemic
        wd:Q8065      # natural disaster
        wd:Q5765950   # massacre
        wd:Q6974      # assassination
        wd:Q8261      # novel
      }
      FILTER(YEAR(?date) >= ${Math.floor(startYear)} && YEAR(?date) <= ${Math.ceil(endYear)})
      ?article schema:about ?event ;
               schema:isPartOf <https://en.wikipedia.org/> ;
               schema:name ?articleTitle .
      OPTIONAL { ?event wdt:P625 ?coord }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
    }
    LIMIT ${Math.min(count * 5, 100)}
  `;

  try {
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Chronos/1.0 (https://github.com/chronos; contact@chronos.app)' },
    });
    if (!resp.ok) return [];

    const data = await resp.json();
    const results: any[] = [];
    const seen = new Set<string>();
    const category = getCategory(startYear);

    for (const binding of data.results?.bindings ?? []) {
      const label = binding.eventLabel?.value;
      if (!label || label.startsWith('Q')) continue; // Skip unresolved QIDs
      if (existingTitles.has(label)) continue;
      if (seen.has(label)) continue;
      seen.add(label);

      const dateStr = binding.date?.value;
      const year = dateStr ? new Date(dateStr).getFullYear() : NaN;
      if (isNaN(year)) continue;

      const wikiTitle = binding.articleTitle?.value;
      const description = label;

      // Parse coordinates if available
      let lat: number | undefined;
      let lng: number | undefined;
      if (binding.coord?.value) {
        const match = binding.coord.value.match(/Point\(([^ ]+) ([^ ]+)\)/);
        if (match) {
          lng = parseFloat(match[1]!);
          lat = parseFloat(match[2]!);
        }
      }

      results.push({
        title: label,
        year,
        description,
        category,
        color: getCategoryColor(category),
        wiki: wikiTitle,
        lat,
        lng,
        geoType: lat !== undefined ? 'point' : undefined,
      });
    }

    // Spread events evenly across the range by sorting and sampling
    results.sort((a, b) => a.year - b.year);
    if (results.length > count) {
      const step = results.length / count;
      const sampled: any[] = [];
      for (let i = 0; i < count; i++) {
        sampled.push(results[Math.floor(i * step)]!);
      }
      return sampled;
    }

    return results;
  } catch {
    return [];
  }
}

// ── Wikipedia "On this day"-style supplementary queries ──────────────

async function discoverFromWikipediaSearch(
  startYear: number,
  endYear: number,
  count: number,
  existingTitles: Set<string>,
): Promise<any[]> {
  // Use Wikipedia's search API to find events in a year range
  // This works well for filling gaps where Wikidata is sparse
  const midYear = Math.round((startYear + endYear) / 2);
  const rangeDesc = endYear - startYear <= 10
    ? `${midYear}`
    : `${Math.round(startYear)}-${Math.round(endYear)}`;

  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch="${rangeDesc}" historical event&srnamespace=0&srlimit=${count}&format=json`;
    const resp = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Chronos/1.0' },
    });
    if (!resp.ok) return [];

    const data = await resp.json();
    const results: any[] = [];
    const category = getCategory(startYear);

    for (const item of data.query?.search ?? []) {
      const title = item.title;
      if (existingTitles.has(title)) continue;

      // Extract a year from the snippet if possible
      const snippet = (item.snippet || '').replace(/<[^>]+>/g, '');
      const yearMatch = snippet.match(/\b(\d{3,4})\b/);
      const year = yearMatch ? parseInt(yearMatch[1]!, 10) : midYear;

      if (year < startYear || year > endYear) continue;

      results.push({
        title,
        year,
        description: snippet.slice(0, 200),
        category,
        color: getCategoryColor(category),
        wiki: title,
      });
    }

    return results.slice(0, count);
  } catch {
    return [];
  }
}

// ── Route handler ───────────────────────────────────────────────────

export function registerDiscoverRoutes(handleRoute: RouteHandler, dbReady: () => boolean) {
  handleRoute('POST', '/api/discover', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('discover', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }

    const parsed = validate(discoverSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };
    const { startYear, endYear, existingTitles, count, tierId } = parsed.data;

    const cellIndex = Math.floor(startYear);
    const cacheKey = `${tierId}:${startYear}:${endYear}`;

    // ── Phase 1: Check DB (source of truth) ──
    if (dbReady()) {
      try {
        const region = await getCacheRegion(tierId || 'default', cellIndex);
        if (region && new Date(region.expires_at) > new Date()) {
          const events = await getEventsInRange(startYear, endYear, undefined, count * 2);
          if (events.length > 0) {
            return { status: 200, data: { events, source: 'database', cached: true } };
          }
        }
      } catch (err: any) {
        console.error('[Discover] DB check failed:', err.message);
      }
    }

    // ── Phase 2: Check memory cache (fallback) ──
    const memCached = memoryCache.get(cacheKey);
    if (memCached && Date.now() - memCached.timestamp < CACHE_TTL) {
      return { status: 200, data: { events: memCached.events, source: 'memory', cached: true } };
    }

    // ── Phase 3: Wikidata + Wikipedia discovery (free, no AI) ──
    const t0 = Date.now();
    const existingSet = new Set(existingTitles);

    // Try Wikidata first, supplement with Wikipedia search if sparse
    let events = await discoverFromWikidata(startYear, endYear, count, existingSet);

    if (events.length < count / 2) {
      const supplement = await discoverFromWikipediaSearch(
        startYear, endYear,
        count - events.length,
        new Set([...existingSet, ...events.map(e => e.title)]),
      );
      events = [...events, ...supplement];
    }

    const latencyMs = Date.now() - t0;

    // Cache in memory
    memoryCache.set(cacheKey, { events, timestamp: Date.now() });
    pruneMemoryCache();

    // ── Phase 4: Persist to DB + mark region ──
    if (dbReady() && events.length > 0) {
      const dbEvents = events.map((e: any, i: number) => ({
        id: `d-${tierId}-${startYear}-${i}`,
        title: e.title, year: e.year, timestamp: e.timestamp || null,
        precision: e.precision || 'year', emoji: e.emoji || '', color: e.color,
        description: e.description, category: e.category, source: 'discovered',
        zoom_tier: tierId, wiki: e.wiki, lat: e.lat, lng: e.lng,
        geo_type: e.geoType, path: e.path, region: e.region,
      }));

      Promise.all([
        upsertEvents(dbEvents),
        markCacheRegion(tierId || 'default', cellIndex, startYear, endYear, events.length),
        logDiscovery(tierId || 'default', startYear, endYear, 'wikidata', 'sparql', events.length, dbEvents.length, undefined, latencyMs),
      ]).catch(err => console.error('[Discover] DB persist error:', err.message));
    }

    return { status: 200, data: { events, source: 'wikidata' } };
  });
}
