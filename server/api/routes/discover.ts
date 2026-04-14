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

/**
 * Thematic category definitions for event discovery.
 *
 * Each theme targets a specific set of Wikidata P31 instance-of types.
 * Running these as parallel queries with per-theme quotas prevents any
 * one theme (historically: military) from swamping the timeline.
 *
 * The quota is a *target share* of the requested count — we try to pull
 * at least that many events from each theme, but fall back to whatever
 * the theme can supply if Wikidata has less for that period.
 *
 * `dateProperty` is the Wikidata property used to date the instance.
 * Most events use P585 (point in time), but creative works use P577
 * (publication date) and some inventions use P571 (inception).
 */
interface ThemeSpec {
  id: string;
  label: string;
  types: string[];
  dateProperty: 'P585' | 'P577' | 'P571';
  // Weight determines per-theme quota: quotas are normalized so weights
  // sum to the requested count.
  weight: number;
}

const THEMES: ThemeSpec[] = [
  {
    id: 'science',
    label: 'Science & discovery',
    types: [
      'Q2334719',    // scientific discovery
      'Q2389789',    // discovery (broader)
      'Q12772819',   // scientific theory introduction
      'Q40218',      // astronomical discovery
    ],
    dateProperty: 'P585',
    weight: 2,
  },
  {
    id: 'invention',
    label: 'Invention & technology',
    types: [
      'Q11019',      // machine
      'Q12522',      // invention (subclass target)
      'Q11460',      // clothing (technology of)
      'Q44432',      // technology
    ],
    dateProperty: 'P571',
    weight: 1.5,
  },
  {
    id: 'literature',
    label: 'Literature',
    types: [
      'Q8261',       // novel
      'Q571',        // book
      'Q34379',      // poem
      'Q1279564',    // play (theatrical work)
    ],
    dateProperty: 'P577',
    weight: 2,
  },
  {
    id: 'art',
    label: 'Art & music',
    types: [
      'Q3305213',    // painting
      'Q482994',     // album
      'Q1344',       // opera
      'Q11424',      // film
      'Q2031291',    // symphony
    ],
    dateProperty: 'P577',
    weight: 2,
  },
  {
    id: 'space',
    label: 'Space exploration',
    types: [
      'Q2133344',    // space mission
      'Q40218',      // astronomical discovery
      'Q26540',      // artificial satellite
    ],
    dateProperty: 'P585',
    weight: 1,
  },
  {
    id: 'politics',
    label: 'Politics & society',
    types: [
      'Q93288',      // treaty
      'Q131569',     // legislation
      'Q40231',      // election
      'Q3881893',    // political speech
      'Q1128324',    // constitution
    ],
    dateProperty: 'P585',
    weight: 2,
  },
  {
    id: 'disaster',
    label: 'Disasters & epidemics',
    types: [
      'Q3839081',    // disaster
      'Q476300',     // epidemic
      'Q12184',      // pandemic
      'Q8065',       // natural disaster
      'Q2252077',    // earthquake
    ],
    dateProperty: 'P585',
    weight: 1,
  },
  {
    id: 'sport_culture',
    label: 'Sport & culture',
    types: [
      'Q5389',       // Olympic Games
      'Q15275719',   // recurring event edition (championships, festivals)
      'Q17317604',   // expedition
      'Q132241',     // festival
    ],
    dateProperty: 'P585',
    weight: 1.5,
  },
  {
    // Revolutions are split out from warfare because they're as much
    // social/political upheavals as military events — well worth surfacing
    // even in a timeline de-emphasizing pure military history.
    id: 'revolution',
    label: 'Revolution & upheaval',
    types: [
      'Q35127',      // revolution
      'Q7278',       // political revolution
      'Q124757',     // riot
      'Q2223653',    // protest
      'Q1006311',    // coup d'état
    ],
    dateProperty: 'P585',
    weight: 1.5,
  },
  {
    // Deliberately lower weight than other themes so battles/wars/campaigns
    // don't dominate the timeline.
    id: 'warfare',
    label: 'Warfare',
    types: [
      'Q178561',     // battle
      'Q198',        // war
      'Q831663',     // military campaign
    ],
    dateProperty: 'P585',
    weight: 1,
  },
];

async function discoverFromWikidata(
  startYear: number,
  endYear: number,
  count: number,
  existingTitles: Set<string>,
): Promise<any[]> {
  // Wikidata works best for human-scale history (-3000 to present).
  // For deep time (geological, cosmic), it has limited coverage.
  if (startYear < -10000) return [];

  const category = getCategory(startYear);
  const startInt = Math.floor(startYear);
  const endInt = Math.ceil(endYear);

  // Compute per-theme quotas from weights. Minimum 1 per theme so every
  // category gets a seat at the table even for small count requests.
  const totalWeight = THEMES.reduce((sum, t) => sum + t.weight, 0);
  const quotas = THEMES.map(t => ({
    theme: t,
    quota: Math.max(1, Math.round((t.weight / totalWeight) * count * 1.4)),
  }));

  // Run all theme queries in parallel. Wikidata's SPARQL endpoint handles
  // concurrent requests fine; the total wall time is ~one query's latency.
  const themeResults = await Promise.all(
    quotas.map(({ theme, quota }) =>
      queryThemeEvents(theme, startInt, endInt, quota * 3, existingTitles, category),
    ),
  );

  // Round-robin merge so the final list mixes themes rather than showing
  // all science first, then all literature, etc. Take up to `quota` from
  // each theme per pass.
  const seenTitles = new Set<string>();
  const merged: any[] = [];
  const indices = new Array(THEMES.length).fill(0);

  let added = true;
  while (merged.length < count * 2 && added) {
    added = false;
    for (let i = 0; i < themeResults.length; i++) {
      const quota = quotas[i]!.quota;
      const taken = indices[i];
      if (taken >= quota) continue;
      const pool = themeResults[i]!;
      while (indices[i] < pool.length) {
        const ev = pool[indices[i]++]!;
        if (seenTitles.has(ev.title)) continue;
        seenTitles.add(ev.title);
        merged.push(ev);
        added = true;
        break;
      }
    }
  }

  // If the quota-based pass left us short, backfill from any leftover
  // events the themes returned (still de-duped). Prevents empty cells
  // in periods where some themes have sparse data.
  if (merged.length < count) {
    for (let i = 0; i < themeResults.length && merged.length < count * 2; i++) {
      for (const ev of themeResults[i]!) {
        if (seenTitles.has(ev.title)) continue;
        seenTitles.add(ev.title);
        merged.push(ev);
      }
    }
  }

  // Sort chronologically, then sample evenly across the range if we have
  // too many. This spreads events across time instead of clustering.
  merged.sort((a, b) => a.year - b.year);
  if (merged.length > count) {
    const step = merged.length / count;
    const sampled: any[] = [];
    for (let i = 0; i < count; i++) {
      sampled.push(merged[Math.floor(i * step)]!);
    }
    return sampled;
  }

  return merged;
}

/**
 * Query Wikidata for events of a specific theme within a year range.
 * Returns raw event objects ready to merge into the final discovery set.
 */
async function queryThemeEvents(
  theme: ThemeSpec,
  startYear: number,
  endYear: number,
  limit: number,
  existingTitles: Set<string>,
  category: string,
): Promise<any[]> {
  const typesClause = theme.types.map(t => `wd:${t}`).join(' ');
  const dateP = theme.dateProperty;

  const query = `
    SELECT DISTINCT ?event ?eventLabel ?date ?coord ?articleTitle WHERE {
      ?event wdt:${dateP} ?date .
      ?event wdt:P31 ?type .
      VALUES ?type { ${typesClause} }
      FILTER(YEAR(?date) >= ${startYear} && YEAR(?date) <= ${endYear})
      ?article schema:about ?event ;
               schema:isPartOf <https://en.wikipedia.org/> ;
               schema:name ?articleTitle .
      OPTIONAL { ?event wdt:P625 ?coord }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
    }
    LIMIT ${Math.min(limit, 50)}
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

    for (const binding of data.results?.bindings ?? []) {
      const label = binding.eventLabel?.value;
      if (!label || label.startsWith('Q')) continue;
      if (existingTitles.has(label)) continue;
      if (seen.has(label)) continue;
      seen.add(label);

      const dateStr = binding.date?.value;
      if (!dateStr) continue;
      const d = new Date(dateStr);
      const intYear = d.getFullYear();
      if (isNaN(intYear)) continue;
      const dayOfYear = (d.getTime() - new Date(intYear, 0, 1).getTime()) / (1000 * 60 * 60 * 24);
      const year = intYear + dayOfYear / 365.25;

      const wikiTitle = binding.articleTitle?.value;
      const timestamp = dateStr.slice(0, 10);

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
        timestamp,
        precision: timestamp.endsWith('01-01') ? 'year' : 'day',
        description: label,
        category,
        color: getCategoryColor(category),
        theme: theme.id,
        themeLabel: theme.label,
        wiki: wikiTitle,
        lat,
        lng,
        geoType: lat !== undefined ? 'point' : undefined,
      });
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
