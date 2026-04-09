import { describe, it, expect } from 'vitest';
import { classifyEvent, supportsPrimarySources } from '../sourceClassification';
import type { TimelineEvent } from '../../types';

function make(partial: Partial<TimelineEvent>): Pick<TimelineEvent, 'sourceClass' | 'category' | 'year'> {
  return {
    year: partial.year ?? 1776,
    category: partial.category ?? 'civilization',
    sourceClass: partial.sourceClass,
  };
}

describe('classifyEvent', () => {
  it('honors explicit sourceClass unconditionally', () => {
    expect(classifyEvent(make({ sourceClass: 'sentinel', year: 1776, category: 'modern' }))).toBe('sentinel');
    expect(classifyEvent(make({ sourceClass: 'cultural', year: -500, category: 'cosmic' }))).toBe('cultural');
  });

  it('routes pre-10000 BCE events to prehistoric regardless of category', () => {
    // Even a mis-categorized "civilization" event in 500,000 BCE is prehistoric
    expect(classifyEvent(make({ year: -500000, category: 'civilization' }))).toBe('prehistoric');
    expect(classifyEvent(make({ year: -13_800_000_000, category: 'cosmic' }))).toBe('prehistoric');
  });

  it('maps cosmic/geological/evolutionary categories to prehistoric', () => {
    expect(classifyEvent(make({ category: 'cosmic', year: -13.8e9 }))).toBe('prehistoric');
    expect(classifyEvent(make({ category: 'geological', year: -4.5e9 }))).toBe('prehistoric');
    expect(classifyEvent(make({ category: 'evolutionary', year: -3.5e9 }))).toBe('prehistoric');
  });

  it('classifies recorded-history events as historical', () => {
    expect(classifyEvent(make({ category: 'civilization', year: 1776 }))).toBe('historical');
    expect(classifyEvent(make({ category: 'modern', year: 1969 }))).toBe('historical');
    expect(classifyEvent(make({ category: 'civilization', year: -500 }))).toBe('historical');
  });

  it('handles the edge of prehistoric at exactly -10000', () => {
    // -10000 and later is historical, earlier is prehistoric
    expect(classifyEvent(make({ category: 'civilization', year: -10000 }))).toBe('historical');
    expect(classifyEvent(make({ category: 'civilization', year: -10001 }))).toBe('prehistoric');
  });
});

describe('supportsPrimarySources', () => {
  it('returns false for sentinel and prehistoric', () => {
    expect(supportsPrimarySources('sentinel')).toBe(false);
    expect(supportsPrimarySources('prehistoric')).toBe(false);
  });

  it('returns true for historical, scientific, and cultural', () => {
    expect(supportsPrimarySources('historical')).toBe(true);
    expect(supportsPrimarySources('scientific')).toBe(true);
    expect(supportsPrimarySources('cultural')).toBe(true);
  });
});
