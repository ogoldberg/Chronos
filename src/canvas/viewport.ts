import type { Viewport } from '../types';
import { clamp } from '../utils/format';

const MIN_SPAN = 0.5;
const MAX_SPAN = 3e10;
const MIN_YEAR = -14e9;
const MAX_YEAR = 2030;

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
  const newCenter = clamp(newLeft + newSpan / 2, MIN_YEAR, MAX_YEAR);
  return { centerYear: newCenter, span: newSpan };
}

export function pan(vp: Viewport, deltaPx: number, width: number): Viewport {
  const yearDelta = (deltaPx / width) * vp.span;
  return {
    centerYear: clamp(vp.centerYear - yearDelta, MIN_YEAR, MAX_YEAR),
    span: vp.span,
  };
}

export function clampViewport(vp: Viewport): Viewport {
  return {
    centerYear: clamp(vp.centerYear, MIN_YEAR, MAX_YEAR),
    span: clamp(vp.span, MIN_SPAN, MAX_SPAN),
  };
}

export function getVisibleRange(vp: Viewport): [number, number] {
  return [vp.centerYear - vp.span / 2, vp.centerYear + vp.span / 2];
}
