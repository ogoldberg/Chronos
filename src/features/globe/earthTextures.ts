/**
 * Earth texture loader.
 *
 * Loads NASA Blue Marble + clouds + normal map + specular map from a public
 * CDN (jsDelivr-hosted three.js example assets, which are CC-licensed and
 * versioned). Caches the loaded THREE.Texture objects globally so reopening
 * the globe panel doesn't refetch.
 *
 * The procedural canvas-painted texture in GlobePanel is kept as a fallback
 * for two reasons:
 *   1. It paints instantly with no network round-trip, so the globe shows
 *      something useful while the high-res CDN download is in flight.
 *   2. For deep-time eras (older than ~10 ka) the modern Blue Marble is
 *      wrong — continents are in the wrong place. The procedural canvas
 *      uses the paleoReconstruction Euler rotations to draw plausible
 *      paleogeography, so we keep using it for ancient years.
 *
 * Paleo-era PALEOMAP rasters (Pangaea, Cretaceous, Eocene, etc.) can be
 * slotted in here later by URL by extending PALEO_TEXTURE_URLS — the
 * loader will pick the closest era texture for the requested year.
 */

import * as THREE from 'three';

const CDN = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/textures/planets';

export const EARTH_TEXTURE_URLS = {
  color:    `${CDN}/earth_atmos_2048.jpg`,
  normal:   `${CDN}/earth_normal_2048.jpg`,
  specular: `${CDN}/earth_specular_2048.jpg`,
  clouds:   `${CDN}/earth_clouds_1024.png`,
};

/**
 * Optional paleo-era textures keyed by the year (negative = BCE) the
 * texture represents. The loader picks the closest entry to the
 * requested year. Add real PALEOMAP rasters here as they become
 * available — the rendering wiring already handles them.
 */
export const PALEO_TEXTURE_URLS: Array<{ year: number; url: string }> = [
  // e.g. { year: -200_000_000, url: '/paleo/pangaea_200ma.jpg' },
];

export interface EarthTextures {
  color: THREE.Texture;
  normal: THREE.Texture;
  specular: THREE.Texture;
  clouds: THREE.Texture;
}

let cachedPromise: Promise<EarthTextures> | null = null;

/**
 * Load and cache the modern Earth textures. Subsequent calls return the
 * same cached promise so the textures are only fetched once per page load.
 */
export function loadEarthTextures(): Promise<EarthTextures> {
  if (cachedPromise) return cachedPromise;
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');

  const load = (url: string, srgb: boolean): Promise<THREE.Texture> =>
    new Promise((resolve, reject) => {
      loader.load(
        url,
        (tex) => {
          if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          resolve(tex);
        },
        undefined,
        (err) => reject(err),
      );
    });

  cachedPromise = Promise.all([
    load(EARTH_TEXTURE_URLS.color, true),
    load(EARTH_TEXTURE_URLS.normal, false),
    load(EARTH_TEXTURE_URLS.specular, false),
    load(EARTH_TEXTURE_URLS.clouds, true),
  ])
    .then(([color, normal, specular, clouds]) => ({ color, normal, specular, clouds }))
    .catch((err) => {
      // Reset cache on failure so a future call can retry.
      cachedPromise = null;
      throw err;
    });

  return cachedPromise;
}

/**
 * Years younger than this use the modern Blue Marble texture. Older years
 * fall back to the procedural paleogeographic canvas because the continents
 * were in different positions.
 *
 * 10 ka is a deliberate boundary: it's roughly the start of the Holocene
 * and the human-historical period most users care about. Even at 10 ka,
 * continental positions are within ~1° of modern, so the Blue Marble is
 * still visually accurate.
 */
export const MODERN_TEXTURE_YEAR_THRESHOLD = -10_000;

/**
 * Decide whether to use the high-res Blue Marble for a given year.
 */
export function isModernEarthYear(year: number): boolean {
  return year >= MODERN_TEXTURE_YEAR_THRESHOLD;
}
