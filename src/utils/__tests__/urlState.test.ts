import { describe, it, expect } from 'vitest';
import { formatNum } from '../urlState';

// These tests are regression coverage for the URL-precision bug
// (commit 7c58cc6): `formatNum` used to call `toExponential(2)` on any
// value ≥ 1e6, which is only 3 significant digits — enough to round a
// clamped center like -6999997974 to -7e9, losing the 2026-year offset
// that puts the right edge of the timeline at present day. On reload,
// that offset was unrecoverable because at span=14B a 2026-year sliver
// is sub-pixel wide and unreachable via drag.
describe('urlState.formatNum', () => {
  it('round-trips small integer years exactly', () => {
    expect(parseFloat(formatNum(1776))).toBe(1776);
    expect(parseFloat(formatNum(-44))).toBe(-44);
    expect(parseFloat(formatNum(0))).toBe(0);
  });

  it('round-trips the clamped max-zoom center without losing the present-day offset', () => {
    // This is the real-world value: nowYear(2026) - MAX_SPAN/2 = -6999997974
    // (roughly). The old encoding produced -7.00e+9 and the round-trip
    // shifted the right edge from 2026 back to year 0.
    const center = -6999997974;
    const roundTripped = parseFloat(formatNum(center));
    // Must preserve precision to within 1 year, which is the granularity
    // at which "is the right edge at present day?" becomes visually real.
    expect(Math.abs(roundTripped - center)).toBeLessThan(1);
  });

  it('round-trips billion-year spans without collapsing', () => {
    const span = 14000000000;
    expect(parseFloat(formatNum(span))).toBe(span);
  });

  it('round-trips fractional years in the <100 range via toPrecision(4)', () => {
    // The <100 branch uses toPrecision(4) for sub-year granularity.
    // Values like 1776.27 (mid-year) should survive with enough precision
    // for month-level display.
    const rt = parseFloat(formatNum(1.5));
    expect(rt).toBeCloseTo(1.5, 3);
  });

  it('rounds sub-year fractions to integers for values ≥ 100', () => {
    // Years are conceptually integers for the purposes of a shareable URL.
    // Anything at or above the hundreds-of-years scale doesn't care about
    // fractional precision.
    expect(formatNum(1776.7)).toBe('1777');
  });
});
