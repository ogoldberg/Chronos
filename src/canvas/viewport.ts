import type { Viewport, TimelineEvent } from '../types';
import { clamp } from '../utils/format';

// An event is visible if its year falls within the current viewport window.
//
// Note: events have a `maxSpan` field that originally also gated visibility
// ("hide me when zoomed out past this span"). The values in the dataset are
// calibrated absurdly tight (e.g. WW2: maxSpan=0.4 years), which meant clicking
// almost any era chip produced an empty timeline. The renderer already handles
// density via grid clustering, so the maxSpan gate is redundant — culling now
// happens visually rather than by hiding events entirely.
export function isEventVisible(ev: TimelineEvent, vp: Viewport): boolean {
  const [left, right] = getVisibleRange(vp);
  return ev.year >= left && ev.year <= right;
}

const MIN_SPAN = 0.5;
// Max span = rough age of the universe. Zooming out further would only
// show empty space before the Big Bang, so we cap it here.
const MAX_SPAN = 1.4e10;
const MIN_YEAR = -14e9;

/**
 * The latest year allowed on the right edge of the viewport. Captured once
 * at module load and never updated. We don't show the future, and the cost
 * of "stale across midnight rollover" is one refresh — the user can do
 * that themselves on New Year's Eve.
 *
 * Captured eagerly (rather than recomputed on every clamp) because every
 * viewport mutation calls into this path during pan/zoom and we don't want
 * the date clock + integer math chewing into the render loop budget.
 *
 * Returns a fractional year (e.g. 2026.263 for early April 2026) so mid-year
 * events don't get rejected by integer truncation.
 */
const NOW_YEAR_AT_LOAD: number = (() => {
  const d = new Date();
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const next = Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  return d.getUTCFullYear() + (d.getTime() - start) / (next - start);
})();

export function nowYear(): number {
  return NOW_YEAR_AT_LOAD;
}

/**
 * Maximum allowed `centerYear` given a viewport span. The right edge
 * (center + span/2) must not exceed `nowYear()`, so
 * center ≤ nowYear() - span/2.
 */
function maxCenterForSpan(span: number): number {
  return NOW_YEAR_AT_LOAD - span / 2;
}

export function yearToPixel(year: number, vp: Viewport, width: number): number {
  const left = vp.centerYear - vp.span / 2;
  return ((year - left) / vp.span) * width;
}

export function pixelToYear(px: number, vp: Viewport, width: number): number {
  const left = vp.centerYear - vp.span / 2;
  return left + (px / width) * vp.span;
}

export function zoomAtCursor(
  vp: Viewport,
  cursorPx: number,
  width: number,
  delta: number
): Viewport {
  const factor = delta > 0 ? 1.15 : 1 / 1.15;
  const cursorYear = pixelToYear(cursorPx, vp, width);
  const newSpan = clamp(vp.span * factor, MIN_SPAN, MAX_SPAN);
  // Keep cursor position fixed
  const frac = cursorPx / width;
  const newLeft = cursorYear - frac * newSpan;
  const newCenter = clamp(newLeft + newSpan / 2, MIN_YEAR, maxCenterForSpan(newSpan));
  return { centerYear: newCenter, span: newSpan };
}

export function pan(vp: Viewport, deltaPx: number, width: number): Viewport {
  const yearDelta = (deltaPx / width) * vp.span;
  return {
    centerYear: clamp(vp.centerYear - yearDelta, MIN_YEAR, maxCenterForSpan(vp.span)),
    span: vp.span,
  };
}

export function clampViewport(vp: Viewport): Viewport {
  const span = clamp(vp.span, MIN_SPAN, MAX_SPAN);
  return {
    centerYear: clamp(vp.centerYear, MIN_YEAR, maxCenterForSpan(span)),
    span,
  };
}

export function getVisibleRange(vp: Viewport): [number, number] {
  return [vp.centerYear - vp.span / 2, vp.centerYear + vp.span / 2];
}
