import { create } from 'zustand';
import type { TimelineEvent, Viewport } from '../types';
import { ANCHOR_EVENTS } from '../data/anchorEvents';
import { clamp } from '../utils/format';
import { readURLState } from '../utils/urlState';

const urlState = readURLState();

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

  // Discovery
  discovering: boolean;
  setDiscovering: (d: boolean) => void;
  cacheStats: { cells: number; events: number };
  setCacheStats: (s: { cells: number; events: number }) => void;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  viewport: urlState.viewport || { centerYear: -4e9, span: 2.8e10 },
  setViewport: (vp) => {
    if (typeof vp === 'function') {
      set(state => ({ viewport: vp(state.viewport) }));
    } else {
      set({ viewport: vp });
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
  setSelectedEvent: (ev) => set({ selectedEvent: ev }),
  hoveredEvent: null,
  setHoveredEvent: (ev) => set({ hoveredEvent: ev }),

  discovering: false,
  setDiscovering: (d) => set({ discovering: d }),
  cacheStats: { cells: 0, events: 0 },
  setCacheStats: (s) => set({ cacheStats: s }),
}));

// Derived: all events (anchors + dynamic, deduplicated)
export function getAllEvents(state: TimelineState): TimelineEvent[] {
  const seen = new Set<string>();
  const result: TimelineEvent[] = [];
  for (const ev of ANCHOR_EVENTS) {
    if (!seen.has(ev.title)) { seen.add(ev.title); result.push(ev); }
  }
  for (const ev of state.dynamicEvents) {
    if (!seen.has(ev.title)) { seen.add(ev.title); result.push(ev); }
  }
  return result;
}
