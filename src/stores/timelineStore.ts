import { create } from 'zustand';
import type { TimelineEvent, Viewport } from '../types';
import { ANCHOR_EVENTS } from '../data/anchorEvents';
import { clamp } from '../utils/format';
import { readURLState } from '../utils/urlState';
import { nowYear, clampViewport } from '../canvas/viewport';

const urlState = readURLState();

// Default "zoom all the way out" viewport: from the Big Bang (13.8 Ga)
// to the present, centered so both ends are comfortably visible. Span is
// slightly larger than 13.8 Ga to give a bit of padding on each side.
// Computed as a function of the current clock so a very long-lived build
// that persists past year boundaries still centers on the right place.
function defaultViewport(): Viewport {
  return clampViewport({
    centerYear: (nowYear() + -13.8e9) / 2,
    span: 14e9,
  });
}

interface TimelineState {
  // Viewport
  viewport: Viewport;
  setViewport: (vp: Viewport | ((prev: Viewport) => Viewport)) => void;

  // Events
  dynamicEvents: TimelineEvent[];
  addEvents: (events: TimelineEvent[]) => void;

  // Selection
  selectedEvent: TimelineEvent | null;
  setSelectedEvent: (ev: TimelineEvent | null) => void;
  hoveredEvent: TimelineEvent | null;
  setHoveredEvent: (ev: TimelineEvent | null) => void;

  // Period selection: a year + span describing a "moment in time the user
  // clicked on the timeline ruler" — independent of any specific event.
  selectedPeriod: { year: number; span: number } | null;
  setSelectedPeriod: (p: { year: number; span: number } | null) => void;

  // Discovery
  discovering: boolean;
  setDiscovering: (d: boolean) => void;
  cacheStats: { cells: number; events: number };
  setCacheStats: (s: { cells: number; events: number }) => void;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  viewport: urlState.viewport ? clampViewport(urlState.viewport) : defaultViewport(),
  setViewport: (vp) => {
    // Always clamp on write. Callers like the cluster-click zoom compute a
    // viewport whose right edge can spill into the future (e.g. a cluster of
    // events spanning -700M..2025 produces center=-518M, span=3.5B, right
    // edge = +1.23B), which is a future year the rest of the pipeline
    // forbids. Without this clamp, the first pan after such a zoom snaps
    // the center violently backward to maxCenter, looking to the user like
    // the timeline "resets" on drag.
    if (typeof vp === 'function') {
      set(state => ({ viewport: clampViewport(vp(state.viewport)) }));
    } else {
      set({ viewport: clampViewport(vp) });
    }
  },

  dynamicEvents: [],
  addEvents: (events) => set(state => {
    const existingTitles = new Set([
      ...ANCHOR_EVENTS.map(e => e.title),
      ...state.dynamicEvents.map(e => e.title),
    ]);
    const fresh = events.filter(e => !existingTitles.has(e.title));
    if (fresh.length === 0) return state;
    const combined = [...state.dynamicEvents, ...fresh];
    // Cap at 2000 — evict farthest from viewport
    if (combined.length > 2000) {
      const center = state.viewport.centerYear;
      return {
        dynamicEvents: combined
          .sort((a, b) => Math.abs(a.year - center) - Math.abs(b.year - center))
          .slice(0, 2000),
      };
    }
    return { dynamicEvents: combined };
  }),

  selectedEvent: null,
  setSelectedEvent: (ev) => set({ selectedEvent: ev, selectedPeriod: ev ? null : get().selectedPeriod }),
  hoveredEvent: null,
  setHoveredEvent: (ev) => set({ hoveredEvent: ev }),

  selectedPeriod: null,
  setSelectedPeriod: (p) => set({ selectedPeriod: p, selectedEvent: p ? null : get().selectedEvent }),

  discovering: false,
  setDiscovering: (d) => set({ discovering: d }),
  cacheStats: { cells: 0, events: 0 },
  setCacheStats: (s) => set({ cacheStats: s }),
}));

// Derived: all events (anchors + dynamic, deduplicated)
// Cached by dynamicEvents reference so the snapshot is stable for
// useSyncExternalStore-based subscribers (zustand v5).
const allEventsCache = new WeakMap<TimelineEvent[], TimelineEvent[]>();
export function getAllEvents(state: TimelineState): TimelineEvent[] {
  const cached = allEventsCache.get(state.dynamicEvents);
  if (cached) return cached;
  const seen = new Set<string>();
  const result: TimelineEvent[] = [];
  for (const ev of ANCHOR_EVENTS) {
    if (!seen.has(ev.title)) { seen.add(ev.title); result.push(ev); }
  }
  for (const ev of state.dynamicEvents) {
    if (!seen.has(ev.title)) { seen.add(ev.title); result.push(ev); }
  }
  allEventsCache.set(state.dynamicEvents, result);
  return result;
}
