/**
 * Parallel Civilization Lanes
 *
 * Splits the timeline into geographic region lanes showing
 * what was happening simultaneously across the world.
 */

export interface RegionLane {
  id: string;
  label: string;
  emoji: string;
  // Approximate bounding box for matching events
  latRange: [number, number];
  lngRange: [number, number];
  color: string;
}

export const REGION_LANES: RegionLane[] = [
  { id: 'europe',     label: 'Europe',       emoji: '🏰', latRange: [35, 72],  lngRange: [-12, 40],  color: '#4169e1' },
  { id: 'mideast',    label: 'Middle East',  emoji: '🕌', latRange: [12, 42],  lngRange: [25, 65],   color: '#daa520' },
  { id: 'southasia',  label: 'South Asia',   emoji: '🕉️', latRange: [5, 38],   lngRange: [60, 100],  color: '#ff8c00' },
  { id: 'eastasia',   label: 'East Asia',    emoji: '🏯', latRange: [18, 55],  lngRange: [100, 150], color: '#dc143c' },
  { id: 'africa',     label: 'Africa',       emoji: '🌍', latRange: [-35, 37], lngRange: [-20, 52],  color: '#228b22' },
  { id: 'americas',   label: 'Americas',     emoji: '🗽', latRange: [-56, 72], lngRange: [-170, -30],color: '#9370db' },
];

/** Match an event to a region based on its coordinates */
export function matchEventToRegion(lat?: number, lng?: number): string | null {
  if (lat == null || lng == null) return null;
  for (const lane of REGION_LANES) {
    if (
      lat >= lane.latRange[0] && lat <= lane.latRange[1] &&
      lng >= lane.lngRange[0] && lng <= lane.lngRange[1]
    ) {
      return lane.id;
    }
  }
  return null;
}
