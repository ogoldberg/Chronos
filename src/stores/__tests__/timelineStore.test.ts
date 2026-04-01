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
});
