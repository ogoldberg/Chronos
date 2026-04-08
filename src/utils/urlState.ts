/**
 * URL State — encode/decode viewport + event selection in the URL
 * Enables shareable deep links like /timeline?y=1776&s=50&event=a-independence
 */

import type { Viewport } from '../types';

interface URLState {
  viewport?: Viewport;
  eventId?: string;
  lanes?: boolean;
}

export function readURLState(): URLState {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const state: URLState = {};

  const y = params.get('y');
  const s = params.get('s');
  if (y && s) {
    state.viewport = {
      centerYear: parseFloat(y),
      span: parseFloat(s),
    };
  }

  const eventId = params.get('event');
  if (eventId) state.eventId = eventId;

  if (params.get('lanes') === '1') state.lanes = true;

  return state;
}

export function writeURLState(
  viewport: Viewport,
  eventId?: string | null,
  lanes?: boolean,
): void {
  const params = new URLSearchParams();

  // Round to reasonable precision to keep URLs clean
  params.set('y', formatNum(viewport.centerYear));
  params.set('s', formatNum(viewport.span));

  if (eventId) params.set('event', eventId);
  if (lanes) params.set('lanes', '1');

  const url = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, '', url);
}

// Exported for tests. The precision of this function is load-bearing for
// the "max zoom out" case — the default viewport has center ≈ -7e9 with
// a tiny fractional offset that places the right edge exactly at present
// day, and losing that offset (as toExponential(2) did) shifts the right
// edge all the way back to year 0.
export function formatNum(n: number): string {
  // Years are conceptually integers — encoding fractional years in the URL
  // is pointless, and losing the 2026-year offset between "clamped max center"
  // and a rounded exponential like -7.00e+9 means the right edge of the
  // timeline jumps from present day back to year 0 on reload. Use integer
  // encoding for any value large enough that toExponential(2) would lose
  // enough precision to matter.
  if (Math.abs(n) >= 1e6) return Math.round(n).toString();
  if (Math.abs(n) >= 100) return Math.round(n).toString();
  return n.toPrecision(4);
}

/**
 * Generate a share URL for the current view
 */
export function getShareURL(
  viewport: Viewport,
  eventId?: string | null,
): string {
  const params = new URLSearchParams();
  params.set('y', formatNum(viewport.centerYear));
  params.set('s', formatNum(viewport.span));
  if (eventId) params.set('event', eventId);
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}
