import { describe, it, expect } from 'vitest';
import { yearToPixel, pixelToYear, zoomAtCursor, pan, getVisibleRange } from '../viewport';

describe('yearToPixel / pixelToYear', () => {
  const vp = { centerYear: 0, span: 2000 };

  it('maps center year to center pixel', () => {
    const px = yearToPixel(0, vp, 1000);
    expect(px).toBe(500);
  });

  it('roundtrips year → pixel → year', () => {
    const year = 500;
    const px = yearToPixel(year, vp, 1000);
    const back = pixelToYear(px, vp, 1000);
    expect(back).toBeCloseTo(year, 5);
  });

  it('left edge maps to year at left of span', () => {
    const year = pixelToYear(0, vp, 1000);
    expect(year).toBe(-1000);
  });

  it('right edge maps to year at right of span', () => {
    const year = pixelToYear(1000, vp, 1000);
    expect(year).toBe(1000);
  });
});

describe('zoomAtCursor', () => {
  it('reduces span on zoom in (negative delta)', () => {
    const vp = { centerYear: 0, span: 1000 };
    const result = zoomAtCursor(vp, 500, 1000, -100);
    expect(result.span).toBeLessThan(1000);
  });

  it('increases span on zoom out (positive delta)', () => {
    const vp = { centerYear: 0, span: 1000 };
    const result = zoomAtCursor(vp, 500, 1000, 100);
    expect(result.span).toBeGreaterThan(1000);
  });

  it('clamps span to minimum', () => {
    const vp = { centerYear: 0, span: 1 };
    const result = zoomAtCursor(vp, 500, 1000, -1000);
    expect(result.span).toBeGreaterThanOrEqual(0.5);
  });
});

describe('pan', () => {
  it('pans right with positive pixel delta', () => {
    const vp = { centerYear: 0, span: 1000 };
    const result = pan(vp, 100, 1000);
    expect(result.centerYear).toBeLessThan(0); // panning right moves view left
  });

  it('preserves span', () => {
    const vp = { centerYear: 0, span: 1000 };
    const result = pan(vp, 100, 1000);
    expect(result.span).toBe(1000);
  });
});

describe('getVisibleRange', () => {
  it('returns correct range', () => {
    const [left, right] = getVisibleRange({ centerYear: 1000, span: 500 });
    expect(left).toBe(750);
    expect(right).toBe(1250);
  });
});
