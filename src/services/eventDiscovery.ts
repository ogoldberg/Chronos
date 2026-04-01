/**
 * Dynamic Event Discovery Engine
 *
 * Divides the timeline into a grid of cells at each zoom tier.
 * Each cell is fetched once, cached in memory + localStorage,
 * and never re-requested. Adjacent cells are prefetched.
 */

import type { TimelineEvent } from '../types';

// Zoom tiers define the grid cell sizes and event counts
// Each tier activates when viewport span <= maxSpan
const ZOOM_TIERS = [
  { id: 'cosmic',       maxSpan: Infinity,  cellSize: 2e9,   count: 8  },
  { id: 'galactic',     maxSpan: 5e9,       cellSize: 5e8,   count: 8  },
  { id: 'geological',   maxSpan: 1e9,       cellSize: 1e8,   count: 10 },
  { id: 'evolutionary', maxSpan: 2e8,       cellSize: 2e7,   count: 10 },
  { id: 'epoch',        maxSpan: 5e7,       cellSize: 5e6,   count: 10 },
  { id: 'age',          maxSpan: 1e7,       cellSize: 1e6,   count: 10 },
  { id: 'era',          maxSpan: 2e6,       cellSize: 2e5,   count: 10 },
  { id: 'deep',         maxSpan: 5e5,       cellSize: 5e4,   count: 10 },
  { id: 'ancient',      maxSpan: 1e5,       cellSize: 1e4,   count: 12 },
  { id: 'classical',    maxSpan: 2e4,       cellSize: 2000,  count: 12 },
  { id: 'historical',   maxSpan: 5000,      cellSize: 500,   count: 12 },
  { id: 'century',      maxSpan: 1000,      cellSize: 100,   count: 12 },
  { id: 'detailed',     maxSpan: 200,       cellSize: 20,    count: 12 },
  { id: 'decade',       maxSpan: 40,        cellSize: 5,     count: 10 },
  { id: 'yearly',       maxSpan: 10,        cellSize: 1,     count: 8  },
];

type CellKey = string; // "tierId:cellIndex"

interface CellState {
  status: 'pending' | 'loading' | 'loaded' | 'error';
  events: TimelineEvent[];
}

const STORAGE_KEY = 'chronos_event_cache_v2';
const MAX_CACHE_ENTRIES = 500; // prevent localStorage bloat

// In-memory cell state
const cellStates = new Map<CellKey, CellState>();

// Pending fetch queue to limit concurrent requests
let activeRequests = 0;
const MAX_CONCURRENT = 2;
const fetchQueue: Array<() => void> = [];

const MAX_QUEUE_DEPTH = 6;

function processQueue() {
  // Drop old queued fetches if user has scrolled away
  while (fetchQueue.length > MAX_QUEUE_DEPTH) {
    fetchQueue.shift(); // drop oldest
  }
  while (activeRequests < MAX_CONCURRENT && fetchQueue.length > 0) {
    const next = fetchQueue.shift();
    next?.();
  }
}

// Load cache from localStorage on init
function loadCache(): Map<CellKey, TimelineEvent[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const entries: [CellKey, TimelineEvent[]][] = JSON.parse(raw);
    const map = new Map(entries);
    // Hydrate cell states
    for (const [key, events] of map) {
      cellStates.set(key, { status: 'loaded', events });
    }
    return map;
  } catch {
    return new Map();
  }
}

function saveCache() {
  try {
    const entries: [CellKey, TimelineEvent[]][] = [];
    for (const [key, state] of cellStates) {
      if (state.status === 'loaded' && state.events.length > 0) {
        entries.push([key, state.events]);
      }
    }
    // Evict oldest entries if over limit
    const toSave = entries.slice(-MAX_CACHE_ENTRIES);
    const json = JSON.stringify(toSave);
    // Check estimated size before writing (~5MB localStorage budget)
    if (json.length > 4 * 1024 * 1024) {
      // Too large — keep only half
      const trimmed = toSave.slice(-Math.floor(MAX_CACHE_ENTRIES / 2));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(STORAGE_KEY, json);
    }
  } catch {
    // localStorage full — clear oldest half and retry
    try {
      const entries: [CellKey, TimelineEvent[]][] = [];
      for (const [key, state] of cellStates) {
        if (state.status === 'loaded' && state.events.length > 0) {
          entries.push([key, state.events]);
        }
      }
      const half = entries.slice(-Math.floor(entries.length / 2));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(half));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}

/** Get cache age in hours for the oldest entry */
export function getCacheAge(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const entries = JSON.parse(raw);
    if (!entries.length) return 0;
    // Check if entries have a timestamp (they don't currently, so return 0)
    return 0;
  } catch {
    return 0;
  }
}

/** Invalidate cache entries for a specific time range (e.g., after new data) */
export function invalidateCacheRange(startYear: number, endYear: number) {
  for (const [key, state] of cellStates) {
    if (state.status !== 'loaded') continue;
    const hasEventsInRange = state.events.some(e => e.year >= startYear && e.year <= endYear);
    if (hasEventsInRange) {
      cellStates.delete(key);
    }
  }
  saveCache();
}

// Init cache
loadCache();

function getTier(span: number) {
  for (const tier of ZOOM_TIERS) {
    if (span <= tier.maxSpan) return tier;
  }
  return ZOOM_TIERS[0];
}

function getActiveTiers(span: number) {
  // Return the current tier plus one tier above for continuity
  const tiers = [];
  for (const tier of ZOOM_TIERS) {
    if (span <= tier.maxSpan) {
      tiers.push(tier);
      break;
    }
    // Include broader tiers that have already been loaded
    tiers.push(tier);
  }
  // Only include the most specific applicable tier and the one above it
  const current = getTier(span);
  const currentIdx = ZOOM_TIERS.indexOf(current);
  const result = [current];
  if (currentIdx > 0) result.unshift(ZOOM_TIERS[currentIdx - 1]);
  return result;
}

function cellKey(tierId: string, cellIndex: number): CellKey {
  return `${tierId}:${cellIndex}`;
}

function cellRange(tier: typeof ZOOM_TIERS[0], cellIndex: number): [number, number] {
  const start = cellIndex * tier.cellSize;
  const end = start + tier.cellSize;
  return [start, end];
}

/**
 * Given a viewport, returns the cells that need to be visible
 * (current view + 1 cell padding on each side for prefetch)
 */
function getNeededCells(
  left: number,
  right: number,
  tier: typeof ZOOM_TIERS[0],
  prefetch = true
) {
  const firstCell = Math.floor(left / tier.cellSize);
  const lastCell = Math.floor(right / tier.cellSize);
  const pad = prefetch ? 1 : 0;
  const cells: number[] = [];
  for (let i = firstCell - pad; i <= lastCell + pad; i++) {
    cells.push(i);
  }
  return cells;
}

export interface DiscoveryResult {
  events: TimelineEvent[];
  loading: boolean;
  pendingCells: number;
}

/**
 * Main discovery function — call from useEffect on viewport change.
 * Returns all cached events visible at this zoom level.
 * Triggers async fetches for uncached cells.
 */
export function discoverEvents(
  centerYear: number,
  span: number,
  existingTitles: Set<string>,
  onNewEvents: (events: TimelineEvent[]) => void,
): DiscoveryResult {
  const left = centerYear - span / 2;
  const right = centerYear + span / 2;
  const tier = getTier(span);

  const neededCells = getNeededCells(left, right, tier);
  const allCachedEvents: TimelineEvent[] = [];
  let pendingCells = 0;
  let anyLoading = false;

  // Also gather events from broader tiers that overlap
  for (const t of ZOOM_TIERS) {
    if (t === tier) continue;
    // Only include broader tiers (larger cell size)
    if (t.cellSize <= tier.cellSize) continue;
    const broaderCells = getNeededCells(left, right, t, false);
    for (const ci of broaderCells) {
      const key = cellKey(t.id, ci);
      const state = cellStates.get(key);
      if (state?.status === 'loaded') {
        allCachedEvents.push(...state.events);
      }
    }
  }

  for (const ci of neededCells) {
    const key = cellKey(tier.id, ci);
    const state = cellStates.get(key);

    if (state?.status === 'loaded') {
      allCachedEvents.push(...state.events);
    } else if (state?.status === 'loading') {
      anyLoading = true;
    } else if (!state || state.status === 'error') {
      // Need to fetch this cell
      pendingCells++;
      anyLoading = true;
      cellStates.set(key, { status: 'loading', events: [] });

      const [cellStart, cellEnd] = cellRange(tier, ci);

      const doFetch = () => {
        activeRequests++;
        fetchCell(tier, cellStart, cellEnd, existingTitles)
          .then(events => {
            cellStates.set(key, { status: 'loaded', events });
            saveCache();
            if (events.length > 0) onNewEvents(events);
          })
          .catch(() => {
            cellStates.set(key, { status: 'error', events: [] });
          })
          .finally(() => {
            activeRequests--;
            processQueue();
          });
      };

      if (activeRequests < MAX_CONCURRENT) {
        doFetch();
      } else {
        fetchQueue.push(doFetch);
      }
    }
  }

  return {
    events: allCachedEvents,
    loading: anyLoading,
    pendingCells,
  };
}

async function fetchCell(
  tier: typeof ZOOM_TIERS[0],
  startYear: number,
  endYear: number,
  existingTitles: Set<string>,
): Promise<TimelineEvent[]> {
  const resp = await fetch('/api/discover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startYear: Math.round(startYear),
      endYear: Math.round(endYear),
      existingTitles: [...existingTitles].slice(0, 50), // limit to avoid huge payloads
      count: tier.count,
      tierId: tier.id,
    }),
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();

  if (!data.events?.length) return [];

  return data.events
    .filter((e: any) => e.title && e.year != null)
    .map((e: any, i: number) => ({
      id: `d-${tier.id}-${Math.round(startYear)}-${i}`,
      title: e.title,
      year: e.year,
      emoji: e.emoji || '📌',
      color: e.color || '#888',
      description: e.description || '',
      category: e.category || 'civilization',
      source: 'discovered' as const,
      wiki: e.wiki,
      // Time precision
      timestamp: e.timestamp,
      precision: e.precision,
      // Multimedia
      imageUrl: e.imageUrl || e.image_url,
      videoUrl: e.videoUrl || e.video_url,
      audioUrl: e.audioUrl || e.audio_url,
      mediaCaption: e.mediaCaption || e.media_caption,
      mediaCredit: e.mediaCredit || e.media_credit,
      // Geographic data
      lat: e.lat,
      lng: e.lng,
      geoType: e.geoType,
      path: e.path,
      region: e.region,
      // Set maxSpan so events from this tier hide when zoomed out past it
      maxSpan: tier.maxSpan === Infinity ? undefined : tier.maxSpan * 2,
    }));
}

/**
 * Get count of cached cells/events for debug display
 */
export function getCacheStats() {
  let cells = 0;
  let events = 0;
  for (const state of cellStates.values()) {
    if (state.status === 'loaded') {
      cells++;
      events += state.events.length;
    }
  }
  return { cells, events };
}

/**
 * Clear all cached data
 */
export function clearCache() {
  cellStates.clear();
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Warm the in-memory cache from DB on startup.
 * Checks /api/config to verify DB is available, then fetches
 * anchor/discovered events for the default viewport range
 * and populates the cell cache.
 */
export async function warmCacheFromDB(): Promise<number> {
  try {
    // Check if DB is available
    const configResp = await fetch('/api/config');
    if (!configResp.ok) return 0;

    // Fetch broad range of events from DB
    const ranges: Array<{ start: number; end: number; tierId: string; cellSize: number }> = [
      { start: -14000000000, end: -1000000000, tierId: 'cosmic', cellSize: 2e9 },
      { start: -1000000000, end: -1000000, tierId: 'geological', cellSize: 1e8 },
      { start: -1000000, end: -10000, tierId: 'evolutionary', cellSize: 2e7 },
      { start: -10000, end: 2030, tierId: 'historical', cellSize: 500 },
    ];

    let totalEvents = 0;

    for (const range of ranges) {
      try {
        const resp = await fetch(`/api/events?start=${range.start}&end=${range.end}&limit=200`);
        if (!resp.ok) continue;
        const data = await resp.json();
        if (!data.events?.length) continue;

        // Group events into cells and populate cell cache
        const events: TimelineEvent[] = data.events.map((e: any) => ({
          id: e.id,
          title: e.title,
          year: e.year,
          emoji: e.emoji || '\ud83d\udccc',
          color: e.color || '#888',
          description: e.description || '',
          category: e.category || 'civilization',
          source: (e.source || 'discovered') as 'anchor' | 'discovered',
          wiki: e.wiki,
          maxSpan: e.max_span,
          lat: e.lat,
          lng: e.lng,
          geoType: e.geo_type,
          path: e.path,
          region: e.region,
          timestamp: e.timestamp,
          precision: e.precision,
        }));

        // Group by cell
        const cellGroups = new Map<string, TimelineEvent[]>();
        for (const ev of events) {
          const ci = Math.floor(ev.year / range.cellSize);
          const key = cellKey(range.tierId, ci);
          const group = cellGroups.get(key) || [];
          group.push(ev);
          cellGroups.set(key, group);
        }

        for (const [key, evts] of cellGroups) {
          // Don't overwrite already-loaded cells
          const existing = cellStates.get(key);
          if (!existing || existing.status !== 'loaded') {
            cellStates.set(key, { status: 'loaded', events: evts });
          }
        }

        totalEvents += events.length;
      } catch {
        // Individual range fetch failed, continue
      }
    }

    if (totalEvents > 0) saveCache();
    return totalEvents;
  } catch {
    return 0;
  }
}
