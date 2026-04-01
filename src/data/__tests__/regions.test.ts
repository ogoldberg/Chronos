import { describe, it, expect } from 'vitest';
import { REGION_LANES, matchEventToRegion } from '../regions';

describe('regions', () => {
  it('has 6 region lanes', () => {
    expect(REGION_LANES).toHaveLength(6);
  });

  it('all regions have required fields', () => {
    for (const lane of REGION_LANES) {
      expect(lane.id).toBeTruthy();
      expect(lane.label).toBeTruthy();
      expect(lane.emoji).toBeTruthy();
      expect(lane.color).toMatch(/^#/);
      expect(lane.latRange).toHaveLength(2);
      expect(lane.lngRange).toHaveLength(2);
    }
  });

  it('all region IDs are unique', () => {
    const ids = REGION_LANES.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('matchEventToRegion', () => {
  it('matches Paris to Europe', () => {
    expect(matchEventToRegion(48.85, 2.35)).toBe('europe');
  });

  it('matches Tokyo to East Asia', () => {
    expect(matchEventToRegion(35.68, 139.69)).toBe('eastasia');
  });

  it('matches Cairo to Middle East', () => {
    expect(matchEventToRegion(30.04, 31.24)).toBe('mideast');
  });

  it('matches New York to Americas', () => {
    expect(matchEventToRegion(40.71, -74.01)).toBe('americas');
  });

  it('matches Nairobi to Africa', () => {
    expect(matchEventToRegion(-1.29, 36.82)).toBe('africa');
  });

  it('matches Mumbai to South Asia', () => {
    expect(matchEventToRegion(19.08, 72.88)).toBe('southasia');
  });

  it('returns null for null coordinates', () => {
    expect(matchEventToRegion(undefined, undefined)).toBeNull();
    expect(matchEventToRegion(null as any, null as any)).toBeNull();
  });

  it('returns null for middle of Pacific', () => {
    // (0, 170) is in the western Pacific — no region covers this
    expect(matchEventToRegion(0, 170)).toBeNull();
  });
});
