/**
 * Simplified paleogeographic reconstruction.
 *
 * Real plate reconstructions use Euler poles per plate from datasets like the
 * GPlates rotation file. We don't ship that here — instead we approximate
 * the major continent motions with per-continent Euler rotations that
 * interpolate between "now" (0 Ma) and "Pangaea" (~200 Ma, during the late
 * Triassic). The rotations are tuned by eye so the continents visibly
 * assemble back into a single supercontinent, which is the user-facing
 * thing the feature needs to communicate.
 *
 * For times older than ~320 Ma (Pangaea assembly) or younger than 0, we
 * clamp. Between keyframes we interpolate the rotation angle linearly.
 *
 * The numbers are approximations — they are NOT good enough for any
 * scientific purpose, but they give a watchable, plausible "Earth changes
 * shape over deep time" visualization.
 */

import type { CoastlinePolyline } from './coastlines';
import { africa, europe, asia, northAmerica, southAmerica, australia, antarctica } from './coastlines';

export interface PaleoContinent {
  name: string;
  coords: CoastlinePolyline;
  /** Color tint for this plate, used to render continent fills. */
  color: string;
}

/** Per-continent rotation spec: Euler pole lat/lng and angle at Pangaea (200 Ma). */
interface PlateRotation {
  name: string;
  color: string;
  coords: CoastlinePolyline;
  /** Euler pole latitude, degrees (axis the plate rotates around). */
  poleLat: number;
  /** Euler pole longitude, degrees. */
  poleLng: number;
  /** Angle in degrees that this plate rotates FROM modern BACK to Pangaea (200 Ma). */
  pangaeaAngle: number;
}

// Hand-tuned reconstructions to approximate Pangaea at 200 Ma.
// Africa is held fixed as the reference frame — every other continent rotates
// around an Euler pole to close the Atlantic and assemble Gondwana / Laurasia.
const PLATES: PlateRotation[] = [
  {
    name: 'Africa',
    color: '#7a5c38',
    coords: africa,
    poleLat: 0,
    poleLng: 0,
    pangaeaAngle: 0, // Africa stays put (reference plate)
  },
  {
    name: 'South America',
    color: '#4a7c3a',
    coords: southAmerica,
    // South America rotates eastward around a pole in the North Atlantic,
    // pressing its eastern coast up against Africa's western coast.
    poleLat: 50,
    poleLng: -35,
    pangaeaAngle: -55,
  },
  {
    name: 'North America',
    color: '#8b6b3a',
    coords: northAmerica,
    // North America rotates east & south so its eastern margin meets the
    // northwestern African / European coast, closing the proto-Atlantic.
    poleLat: 65,
    poleLng: -30,
    pangaeaAngle: -42,
  },
  {
    name: 'Europe',
    color: '#5a6d5a',
    coords: europe,
    // Europe rotates south, closing the Tethys and meeting northern Africa.
    poleLat: 40,
    poleLng: 25,
    pangaeaAngle: 18,
  },
  {
    name: 'Asia',
    color: '#6b5a3a',
    coords: asia,
    // Asia rotates somewhat south. India is not split out here — it moves
    // with Asia, so the "India attaches to Africa" motion is not captured
    // (a known limitation of this simplified single-plate-per-continent model).
    poleLat: 30,
    poleLng: 80,
    pangaeaAngle: 22,
  },
  {
    name: 'Australia',
    color: '#a56b3a',
    coords: australia,
    // Australia was part of Gondwana — rotated far south, snug against
    // eastern Antarctica and southern India.
    poleLat: -10,
    poleLng: 100,
    pangaeaAngle: 50,
  },
  {
    name: 'Antarctica',
    color: '#cad7e8',
    coords: antarctica,
    // Antarctica held roughly over the south pole but needs to rotate up
    // so its northern edge meets southern Africa / South America.
    poleLat: 0,
    poleLng: 20,
    pangaeaAngle: -35,
  },
];

/** Degrees → radians. */
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Convert lat/lng to unit cartesian. */
function toCartesian(lat: number, lng: number): [number, number, number] {
  const phi = (90 - lat) * D2R;
  const theta = (lng + 180) * D2R;
  return [
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  ];
}

/** Convert unit cartesian back to lat/lng. */
function toLatLng(v: [number, number, number]): [number, number] {
  const [x, y, z] = v;
  const len = Math.hypot(x, y, z) || 1;
  const ny = y / len;
  const nx = x / len;
  const nz = z / len;
  const phi = Math.acos(Math.max(-1, Math.min(1, ny)));
  const theta = Math.atan2(nz, -nx);
  const lat = 90 - phi * R2D;
  let lng = theta * R2D - 180;
  while (lng < -180) lng += 360;
  while (lng > 180) lng -= 360;
  return [lat, lng];
}

/** Rodrigues' rotation formula — rotate a vector around an axis by angle (radians). */
function rotateAroundAxis(
  v: [number, number, number],
  axis: [number, number, number],
  angle: number,
): [number, number, number] {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const [x, y, z] = v;
  const [ax, ay, az] = axis;
  const dot = x * ax + y * ay + z * az;
  return [
    x * cosA + (ay * z - az * y) * sinA + ax * dot * (1 - cosA),
    y * cosA + (az * x - ax * z) * sinA + ay * dot * (1 - cosA),
    z * cosA + (ax * y - ay * x) * sinA + az * dot * (1 - cosA),
  ];
}

/**
 * Return paleogeographic continent outlines for the given year.
 *
 * For year >= 0 CE (i.e. year ≥ -0 Ma in geologic speak) continents are
 * rendered unchanged from their modern shapes. Going back in deep time,
 * each continent rotates along its Euler pole, proportionally to how far
 * back we are from 0 Ma toward Pangaea (200 Ma ago = -200_000_000 in
 * Chronos years).
 */
export function getPaleoContinents(year: number): PaleoContinent[] {
  // Chronos years: negative = past. Convert to Ma (millions of years before 0 CE).
  const maBefore = Math.max(0, -year / 1e6);
  // Fraction of the way back to Pangaea (200 Ma). Values above 1 (i.e.
  // older than 200 Ma) are clamped — we just show the Pangaea-ish state.
  const pangaeaFrac = Math.min(1.4, maBefore / 200);

  return PLATES.map(plate => {
    if (plate.pangaeaAngle === 0 || pangaeaFrac === 0) {
      return { name: plate.name, coords: plate.coords, color: plate.color };
    }
    const angle = plate.pangaeaAngle * pangaeaFrac * D2R;
    const axis = toCartesian(plate.poleLat, plate.poleLng);
    const rotated: CoastlinePolyline = plate.coords.map(([lng, lat]) => {
      const v = toCartesian(lat, lng);
      const r = rotateAroundAxis(v, axis, angle);
      const [newLat, newLng] = toLatLng(r);
      return [newLng, newLat];
    });
    return { name: plate.name, coords: rotated, color: plate.color };
  });
}

/**
 * Short human-readable label for the reconstruction at a given year.
 * Used by the globe panel to tell the user what era's geography they're seeing.
 */
export function paleoEraLabel(year: number): string {
  const maBefore = -year / 1e6;
  if (maBefore < 5) return 'Modern';
  if (maBefore < 30) return 'Neogene';
  if (maBefore < 66) return 'Paleogene';
  if (maBefore < 145) return 'Cretaceous';
  if (maBefore < 200) return 'Jurassic — breakup of Pangaea';
  if (maBefore < 250) return 'Triassic — Pangaea';
  if (maBefore < 320) return 'Carboniferous — Pangaea assembling';
  return 'Pre-Pangaea (not reconstructed)';
}
