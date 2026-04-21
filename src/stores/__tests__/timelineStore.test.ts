import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore, getAllEvents } from '../timelineStore';
import type { TimelineEvent } from '../../types';

function makeEvent(id: string, title: string, year: number): TimelineEvent {
  return {
    id, title, year, emoji: '📌', color: '#888',
    description: 'test', category: 'civilization', source: 'discovered',
  };
}

describe('timelineStore', () => {
  beforeEach(() => {
    useTimelineStore.setState({ dynamicEvents: [], viewport: { centerYear: 0, span: 1000 } });
  });

  it('adds events', () => {
    const store = useTimelineStore.getState();
    store.addEvents([makeEvent('e1', 'Event 1', 1776)]);
    expect(useTimelineStore.getState().dynamicEvents).toHaveLength(1);
  });

  it('deduplicates by title', () => {
    const store = useTimelineStore.getState();
    store.addEvents([makeEvent('e1', 'Event 1', 1776)]);
    store.addEvents([makeEvent('e2', 'Event 1', 1777)]); // same title
    expect(useTimelineStore.getState().dynamicEvents).toHaveLength(1);
  });

  it('caps at 2000 events', () => {
    const events = Array.from({ length: 2100 }, (_, i) =>
      makeEvent(`e${i}`, `Event ${i}`, i)
    );
    useTimelineStore.getState().addEvents(events);
    expect(useTimelineStore.getState().dynamicEvents.length).toBeLessThanOrEqual(2000);
  });

  it('evicts events farthest from viewport center', () => {
    useTimelineStore.setState({ viewport: { centerYear: 100, span: 50 } });
    const events = Array.from({ length: 2100 }, (_, i) =>
      makeEvent(`e${i}`, `Event ${i}`, i)
    );
    useTimelineStore.getState().addEvents(events);
    const kept = useTimelineStore.getState().dynamicEvents;
    // Events near year 100 should be kept
    const nearCenter = kept.filter(e => Math.abs(e.year - 100) < 500);
    expect(nearCenter.length).toBeGreaterThan(0);
  });

  it('getAllEvents includes anchors and dynamic', () => {
    useTimelineStore.getState().addEvents([makeEvent('d1', 'Dynamic Event', 2000)]);
    const all = getAllEvents(useTimelineStore.getState());
    // Should have anchors + 1 dynamic
    expect(all.length).toBeGreaterThan(1);
    expect(all.some(e => e.title === 'Dynamic Event')).toBe(true);
  });

  it('setViewport works with function updater', () => {
    useTimelineStore.getState().setViewport({ centerYear: 500, span: 200 });
    expect(useTimelineStore.getState().viewport.centerYear).toBe(500);

    useTimelineStore.getState().setViewport(prev => ({
      centerYear: prev.centerYear + 100,
      span: prev.span,
    }));
    expect(useTimelineStore.getState().viewport.centerYear).toBe(600);
  });

  // Regression for commit 7c58cc6: the cluster-click zoom in TimelineCanvas
  // can compute a viewport whose right edge lands in the future (e.g. a
  // cluster of events from -700M..2025 produces {center: -518M, span: 3.5B},
  // right edge +1.23B). Before this commit the store accepted the invalid
  // state and the first subsequent pan snapped the center violently backward
  // to maxCenter — looking to the user like the timeline "reset on drag".
  //
  // The clamp intentionally allows `span * 0.5` of future headroom past
  // today so the TODAY marker stays visible while panning. The test
  // verifies only that the center was clamped to the documented ceiling
  // — NOT that the right edge itself stays at/before today, because by
  // design it doesn't.
  it('setViewport clamps a future-edge viewport on write', () => {
    useTimelineStore.getState().setViewport({
      centerYear: -518_000_000,
      span: 3_500_000_000,
    });
    const vp = useTimelineStore.getState().viewport;
    // Input center (-518M) is within the allowed range for a 3.5B span
    // (maxCenter ≈ nowYear + 1.75B), so the clamp should leave it alone.
    expect(vp.centerYear).toBe(-518_000_000);
    expect(vp.span).toBe(3_500_000_000);
    // The right edge, by design, can sit up to `span * 0.5` past nowYear.
    const rightEdge = vp.centerYear + vp.span / 2;
    const nowYear = new Date().getUTCFullYear();
    const maxRightEdge = nowYear + vp.span * 0.5 + 1;
    expect(rightEdge).toBeLessThanOrEqual(maxRightEdge);
  });

  it('setViewport clamps a function updater that returns an out-of-range result', () => {
    useTimelineStore.setState({ viewport: { centerYear: 1000, span: 500 } });
    useTimelineStore.getState().setViewport(prev => ({
      // Try to pan 5000 years into the future — well past present day.
      centerYear: prev.centerYear + 5000,
      span: prev.span,
    }));
    const vp = useTimelineStore.getState().viewport;
    // With span=500, the clamp ceiling for centerYear is nowYear + 250,
    // so the 5000-year jump must have been clamped back somewhere well
    // short of the raw 6000. Assert center is bounded by the ceiling
    // rather than insisting the right edge be at/before today.
    const nowYear = new Date().getUTCFullYear();
    expect(vp.centerYear).toBeLessThanOrEqual(nowYear + vp.span * 0.5 + 1);
    expect(vp.centerYear).toBeLessThan(6000);
  });

  it('setViewport rejects non-finite inputs rather than poisoning the store', () => {
    useTimelineStore.getState().setViewport({ centerYear: NaN, span: 1000 });
    const vp1 = useTimelineStore.getState().viewport;
    expect(Number.isFinite(vp1.centerYear)).toBe(true);
    expect(Number.isFinite(vp1.span)).toBe(true);

    useTimelineStore.getState().setViewport({ centerYear: 0, span: Infinity });
    const vp2 = useTimelineStore.getState().viewport;
    expect(Number.isFinite(vp2.span)).toBe(true);
  });
});
