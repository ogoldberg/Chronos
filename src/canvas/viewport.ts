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

// ~1 month. Lower than the old 0.5yr floor so users can actually zoom
// into a single month (e.g., "Apr 2026") and trigger per-month discovery
// rather than hitting the clamp and seeing a no-op.
const MIN_SPAN = 1 / 12;
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
 * Maximum allowed `centerYear` given a viewport span. Originally the
 * right edge was hard-pinned to `nowYear()`, which made cosmic-scale
 * views feel broken: pressing → or dragging right did nothing because
 * the viewport was already flush with the present. We now allow the
 * right edge to advance half a span past now, so there's always some
 * visible "future" headroom to pan into. The renderer draws a
 * labeled future zone past the TODAY marker so the extra space is
 * visually legible rather than empty.
 */
const FUTURE_HEADROOM_FRAC = 0.5;
function maxCenterForSpan(span: number): number {
  return NOW_YEAR_AT_LOAD + span * FUTURE_HEADROOM_FRAC;
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
  // Guard against non-finite inputs. Math.min/max propagate NaN, so an
  // upstream NaN (parseFloat on a malformed URL param, a divide-by-zero
  // in a zoom calc, etc.) would poison the store and every subsequent
  // render. Fall back to MAX_SPAN + 0 for pathological values — they'll
  // immediately get re-clamped to valid bounds by the caller's next action.
  const rawSpan = Number.isFinite(vp.span) ? vp.span : MAX_SPAN;
  const rawCenter = Number.isFinite(vp.centerYear) ? vp.centerYear : 0;
  const span = clamp(rawSpan, MIN_SPAN, MAX_SPAN);
  return {
    centerYear: clamp(rawCenter, MIN_YEAR, maxCenterForSpan(span)),
    span,
  };
}

export function getVisibleRange(vp: Viewport): [number, number] {
  return [vp.centerYear - vp.span / 2, vp.centerYear + vp.span / 2];
}
