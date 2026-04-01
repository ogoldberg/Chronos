import { describe, it, expect } from 'vitest';
import { formatYear, formatYearShort, scaleLabel, clamp } from '../format';

describe('formatYear', () => {
  it('formats billions', () => {
    expect(formatYear(-13800000000)).toContain('billion');
    expect(formatYear(-13800000000)).toContain('ago');
  });

  it('formats millions', () => {
    expect(formatYear(-66000000)).toContain('million');
  });

  it('formats BCE years', () => {
    expect(formatYear(-500)).toBe('500 BCE');
  });

  it('formats CE years', () => {
    expect(formatYear(1776)).toContain('1776');
  });

  it('formats sub-year with month', () => {
    const result = formatYear(1969.55);
    expect(result).toContain('1969');
  });

  it('handles zero as 1 CE', () => {
    expect(formatYear(0)).toBe('1 CE');
  });
});

describe('formatYearShort', () => {
  it('formats billions as B', () => {
    expect(formatYearShort(-13800000000)).toContain('B');
  });

  it('formats millions as M', () => {
    expect(formatYearShort(-66000000)).toContain('M');
  });

  it('formats thousands as K', () => {
    expect(formatYearShort(-12000)).toContain('K');
  });
});

describe('scaleLabel', () => {
  it('returns COSMIC for huge spans', () => {
    expect(scaleLabel(2e10)).toBe('COSMIC');
  });

  it('returns CONTEMPORARY for tiny spans', () => {
    expect(scaleLabel(2)).toBe('CONTEMPORARY');
  });

  it('returns HISTORICAL for medium spans', () => {
    expect(scaleLabel(100)).toBe('HISTORICAL');
  });
});

describe('clamp', () => {
  it('clamps below min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps above max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('passes through values in range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
});
