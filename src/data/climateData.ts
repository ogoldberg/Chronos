/**
 * Approximate historical data for climate & economic overlays.
 * Values are best-effort estimates from historical/scientific consensus.
 */

export interface DataPoint {
  year: number;
  value: number;
}

/** World population estimates (in millions) */
export const WORLD_POPULATION: DataPoint[] = [
  { year: -10000, value: 5 },
  { year: -8000, value: 5 },
  { year: -5000, value: 18 },
  { year: -4000, value: 28 },
  { year: -3000, value: 45 },
  { year: -2000, value: 72 },
  { year: -1000, value: 115 },
  { year: -500, value: 150 },
  { year: 1, value: 300 },
  { year: 200, value: 257 },
  { year: 500, value: 210 },
  { year: 800, value: 240 },
  { year: 1000, value: 310 },
  { year: 1200, value: 400 },
  { year: 1340, value: 443 },
  { year: 1400, value: 350 },
  { year: 1600, value: 560 },
  { year: 1800, value: 990 },
  { year: 1900, value: 1650 },
  { year: 1950, value: 2520 },
  { year: 2000, value: 6130 },
  { year: 2025, value: 8100 },
];

/**
 * Global temperature anomaly relative to 1850-1900 baseline (degrees C).
 * Negative values = cooler than baseline, positive = warmer.
 */
export const TEMPERATURE_ANOMALY: DataPoint[] = [
  { year: -10000, value: -4.5 },
  { year: -8000, value: -1.5 },
  { year: -6000, value: 0.5 },
  { year: -4000, value: 0.3 },
  { year: -2000, value: -0.2 },
  { year: 0, value: 0.0 },
  { year: 500, value: -0.3 },
  { year: 900, value: 0.2 },
  { year: 1100, value: 0.3 },
  { year: 1300, value: 0.0 },
  { year: 1500, value: -0.3 },
  { year: 1650, value: -0.5 },
  { year: 1850, value: 0.0 },
  { year: 1950, value: 0.2 },
  { year: 2000, value: 0.7 },
  { year: 2025, value: 1.3 },
];

/** Atmospheric CO2 concentration (parts per million) */
export const CO2_CONCENTRATION: DataPoint[] = [
  { year: -10000, value: 260 },
  { year: -5000, value: 265 },
  { year: 0, value: 275 },
  { year: 1000, value: 280 },
  { year: 1750, value: 278 },
  { year: 1850, value: 285 },
  { year: 1900, value: 296 },
  { year: 1950, value: 311 },
  { year: 1980, value: 339 },
  { year: 2000, value: 370 },
  { year: 2025, value: 425 },
];

/* ------------------------------------------------------------------ */
/*  Per-region population estimates (millions)                         */
/* ------------------------------------------------------------------ */

export interface RegionDataSeries {
  regionId: string;
  label: string;
  data: DataPoint[];
}

export const POPULATION_BY_REGION: RegionDataSeries[] = [
  { regionId: 'europe', label: 'Europe', data: [
    { year: -3000, value: 2 }, { year: -2000, value: 5 }, { year: -1000, value: 10 },
    { year: -500, value: 18 }, { year: 1, value: 35 }, { year: 500, value: 25 },
    { year: 1000, value: 40 }, { year: 1340, value: 75 }, { year: 1600, value: 100 },
    { year: 1800, value: 200 }, { year: 1900, value: 400 }, { year: 2025, value: 450 },
  ]},
  { regionId: 'eastasia', label: 'China', data: [
    { year: -3000, value: 3 }, { year: -2000, value: 8 }, { year: -1000, value: 20 },
    { year: -500, value: 30 }, { year: 1, value: 60 }, { year: 500, value: 50 },
    { year: 1000, value: 80 }, { year: 1300, value: 120 }, { year: 1600, value: 160 },
    { year: 1800, value: 330 }, { year: 1900, value: 400 }, { year: 2025, value: 1425 },
  ]},
  { regionId: 'southasia', label: 'India', data: [
    { year: -3000, value: 2 }, { year: -2000, value: 5 }, { year: -1000, value: 15 },
    { year: -500, value: 25 }, { year: 1, value: 50 }, { year: 500, value: 40 },
    { year: 1000, value: 70 }, { year: 1300, value: 100 }, { year: 1600, value: 130 },
    { year: 1800, value: 200 }, { year: 1900, value: 290 }, { year: 2025, value: 1440 },
  ]},
  { regionId: 'mideast', label: 'Middle East', data: [
    { year: -3000, value: 5 }, { year: -2000, value: 8 }, { year: -1000, value: 12 },
    { year: -500, value: 18 }, { year: 1, value: 25 }, { year: 500, value: 20 },
    { year: 1000, value: 25 }, { year: 1300, value: 20 }, { year: 1600, value: 22 },
    { year: 1800, value: 28 }, { year: 1900, value: 40 }, { year: 2025, value: 400 },
  ]},
  { regionId: 'africa', label: 'Africa', data: [
    { year: -3000, value: 5 }, { year: -2000, value: 7 }, { year: -1000, value: 10 },
    { year: -500, value: 14 }, { year: 1, value: 20 }, { year: 500, value: 25 },
    { year: 1000, value: 40 }, { year: 1300, value: 60 }, { year: 1600, value: 55 },
    { year: 1800, value: 70 }, { year: 1900, value: 110 }, { year: 2025, value: 1460 },
  ]},
  { regionId: 'americas', label: 'Americas', data: [
    { year: -3000, value: 1 }, { year: -2000, value: 2 }, { year: -1000, value: 5 },
    { year: -500, value: 8 }, { year: 1, value: 12 }, { year: 500, value: 18 },
    { year: 1000, value: 30 }, { year: 1300, value: 50 }, { year: 1600, value: 15 },
    { year: 1800, value: 30 }, { year: 1900, value: 150 }, { year: 2025, value: 1040 },
  ]},
];

/* ------------------------------------------------------------------ */
/*  GDP estimates per major civilization (B$ 1990 intl Maddison)       */
/* ------------------------------------------------------------------ */

export interface CivGDPSeries {
  id: string;
  label: string;
  regionId: string;
  data: DataPoint[];
}

export const GDP_BY_CIVILIZATION: CivGDPSeries[] = [
  { id: 'roman', label: 'Roman Empire', regionId: 'europe', data: [
    { year: -200, value: 6 }, { year: -50, value: 12 }, { year: 1, value: 18 },
    { year: 100, value: 22 }, { year: 200, value: 20 }, { year: 300, value: 15 },
    { year: 400, value: 10 }, { year: 476, value: 6 },
  ]},
  { id: 'han', label: 'Han Dynasty', regionId: 'eastasia', data: [
    { year: -200, value: 8 }, { year: -100, value: 14 }, { year: 1, value: 20 },
    { year: 50, value: 22 }, { year: 100, value: 18 }, { year: 150, value: 15 },
    { year: 200, value: 10 }, { year: 220, value: 8 },
  ]},
  { id: 'song', label: 'Song Dynasty', regionId: 'eastasia', data: [
    { year: 960, value: 30 }, { year: 1000, value: 50 }, { year: 1050, value: 65 },
    { year: 1100, value: 80 }, { year: 1150, value: 75 }, { year: 1200, value: 60 },
    { year: 1250, value: 45 }, { year: 1279, value: 35 },
  ]},
  { id: 'mughal', label: 'Mughal Empire', regionId: 'southasia', data: [
    { year: 1526, value: 50 }, { year: 1575, value: 60 }, { year: 1600, value: 74 },
    { year: 1650, value: 90 }, { year: 1700, value: 95 }, { year: 1750, value: 80 },
    { year: 1800, value: 50 }, { year: 1857, value: 35 },
  ]},
  { id: 'ottoman', label: 'Ottoman Empire', regionId: 'mideast', data: [
    { year: 1400, value: 10 }, { year: 1500, value: 18 }, { year: 1550, value: 25 },
    { year: 1600, value: 30 }, { year: 1700, value: 28 }, { year: 1800, value: 22 },
    { year: 1870, value: 18 }, { year: 1913, value: 15 },
  ]},
  { id: 'british', label: 'British Empire', regionId: 'europe', data: [
    { year: 1700, value: 12 }, { year: 1750, value: 18 }, { year: 1800, value: 35 },
    { year: 1850, value: 80 }, { year: 1870, value: 120 }, { year: 1913, value: 230 },
    { year: 1938, value: 280 }, { year: 1945, value: 250 },
  ]},
  { id: 'usa', label: 'USA', regionId: 'americas', data: [
    { year: 1800, value: 5 }, { year: 1850, value: 20 }, { year: 1870, value: 50 },
    { year: 1900, value: 130 }, { year: 1913, value: 240 }, { year: 1950, value: 1400 },
    { year: 2000, value: 9800 }, { year: 2025, value: 23000 },
  ]},
];

/* ------------------------------------------------------------------ */
/*  Trade route volume estimates (arbitrary index 0-100)               */
/* ------------------------------------------------------------------ */

export interface TradeRouteSeries {
  id: string;
  label: string;
  color: string;
  data: DataPoint[];
}

export const TRADE_ROUTE_VOLUMES: TradeRouteSeries[] = [
  { id: 'silkroad', label: 'Silk Road', color: '#daa520', data: [
    { year: -200, value: 10 }, { year: 1, value: 35 }, { year: 200, value: 50 },
    { year: 700, value: 70 }, { year: 1200, value: 90 }, { year: 1500, value: 30 },
  ]},
  { id: 'mediterranean', label: 'Mediterranean', color: '#4169e1', data: [
    { year: -800, value: 15 }, { year: -200, value: 50 }, { year: 1, value: 70 },
    { year: 500, value: 30 }, { year: 1200, value: 65 }, { year: 1500, value: 80 },
  ]},
  { id: 'atlantic', label: 'Atlantic', color: '#9370db', data: [
    { year: 1500, value: 5 }, { year: 1600, value: 20 }, { year: 1700, value: 40 },
    { year: 1800, value: 70 }, { year: 1900, value: 90 }, { year: 2000, value: 100 },
  ]},
];

/**
 * GDP estimates for major civilizations / global economy
 * (billions of 1990 international dollars, Maddison estimates + extensions)
 */
export const GDP_ESTIMATES: DataPoint[] = [
  { year: -3000, value: 2 },
  { year: -2000, value: 4 },
  { year: -1000, value: 8 },
  { year: -500, value: 15 },
  { year: 1, value: 30 },
  { year: 500, value: 25 },
  { year: 1000, value: 120 },
  { year: 1300, value: 175 },
  { year: 1500, value: 248 },
  { year: 1600, value: 330 },
  { year: 1700, value: 371 },
  { year: 1820, value: 695 },
  { year: 1870, value: 1100 },
  { year: 1913, value: 2700 },
  { year: 1950, value: 5300 },
  { year: 2000, value: 36400 },
  { year: 2025, value: 85000 },
];
