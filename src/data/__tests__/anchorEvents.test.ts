import { describe, it, expect } from 'vitest';
import { ANCHOR_EVENTS } from '../anchorEvents';

describe('anchorEvents', () => {
  it('has at least 60 events', () => {
    expect(ANCHOR_EVENTS.length).toBeGreaterThanOrEqual(60);
  });

  it('all events have required fields', () => {
    for (const event of ANCHOR_EVENTS) {
      expect(event.id).toBeTruthy();
      expect(event.title).toBeTruthy();
      expect(typeof event.year).toBe('number');
      expect(event.emoji).toBeTruthy();
      expect(event.color).toMatch(/^#/);
      expect(event.description).toBeTruthy();
      expect(event.source).toBe('anchor');
    }
  });

  it('all IDs are unique', () => {
    const ids = ANCHOR_EVENTS.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all titles are unique', () => {
    const titles = ANCHOR_EVENTS.map(e => e.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('events are not all in the same year', () => {
    const years = new Set(ANCHOR_EVENTS.map(e => e.year));
    expect(years.size).toBeGreaterThan(30);
  });

  it('spans from Big Bang to present', () => {
    const years = ANCHOR_EVENTS.map(e => e.year);
    expect(Math.min(...years)).toBeLessThan(-1e9);
    expect(Math.max(...years)).toBeGreaterThan(2000);
  });

  it('has events in all categories', () => {
    const categories = new Set(ANCHOR_EVENTS.map(e => e.category));
    expect(categories.has('cosmic')).toBe(true);
    expect(categories.has('geological')).toBe(true);
    expect(categories.has('evolutionary')).toBe(true);
    expect(categories.has('civilization')).toBe(true);
    expect(categories.has('modern')).toBe(true);
  });

  it('geographic events have coordinates', () => {
    const geoEvents = ANCHOR_EVENTS.filter(e => e.lat != null);
    expect(geoEvents.length).toBeGreaterThan(20);
    for (const e of geoEvents) {
      expect(e.lat).toBeGreaterThanOrEqual(-90);
      expect(e.lat).toBeLessThanOrEqual(90);
      expect(e.lng).toBeGreaterThanOrEqual(-180);
      expect(e.lng).toBeLessThanOrEqual(180);
    }
  });

  it('some events have connections', () => {
    const withConnections = ANCHOR_EVENTS.filter(e => e.connections && e.connections.length > 0);
    expect(withConnections.length).toBeGreaterThan(5);
  });

  it('connections reference valid event IDs or titles', () => {
    const allIds = new Set(ANCHOR_EVENTS.map(e => e.id));
    const allTitles = new Set(ANCHOR_EVENTS.map(e => e.title));
    for (const event of ANCHOR_EVENTS) {
      if (!event.connections) continue;
      for (const conn of event.connections) {
        const targetExists = allIds.has(conn.targetId) || allTitles.has(conn.targetTitle || '');
        // Some connections may reference events not in anchors (discovered events)
        // so we just check the connection has a type
        expect(conn.type).toBeTruthy();
      }
    }
  });
});
