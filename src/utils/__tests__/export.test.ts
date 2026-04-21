import { describe, it, expect, vi } from 'vitest';
import { exportEventsJSON, generateEmbedSnippet } from '../export';
import type { TimelineEvent, Viewport } from '../../types';

// Mock window.location for URL generation
vi.stubGlobal('window', { location: { origin: 'https://chronosapp.org', pathname: '/' } });

const mockViewport: Viewport = { centerYear: 1776, span: 50 };

const mockEvents: TimelineEvent[] = [
  {
    id: 'e1', title: 'American Independence', year: 1776,
    emoji: '🗽', color: '#3c78d8', description: 'Declaration signed',
    category: 'modern', source: 'anchor',
  },
  {
    id: 'e2', title: 'French Revolution', year: 1789,
    emoji: '🥖', color: '#0055a4', description: 'Bastille falls',
    category: 'modern', source: 'anchor',
  },
];

describe('exportEventsJSON', () => {
  it('produces valid JSON', () => {
    const json = exportEventsJSON(mockEvents, mockViewport);
    const parsed = JSON.parse(json);
    expect(parsed.chronos).toBeDefined();
    expect(parsed.events).toHaveLength(2);
  });

  it('includes viewport metadata', () => {
    const json = exportEventsJSON(mockEvents, mockViewport);
    const parsed = JSON.parse(json);
    expect(parsed.chronos.viewport.centerYear).toBe(1776);
    expect(parsed.chronos.viewport.span).toBe(50);
  });

  it('includes event titles and years', () => {
    const json = exportEventsJSON(mockEvents, mockViewport);
    const parsed = JSON.parse(json);
    expect(parsed.events[0].title).toBe('American Independence');
    expect(parsed.events[1].year).toBe(1789);
  });

  it('excludes internal fields (id, emoji, color)', () => {
    const json = exportEventsJSON(mockEvents, mockViewport);
    const parsed = JSON.parse(json);
    expect(parsed.events[0].id).toBeUndefined();
    expect(parsed.events[0].emoji).toBeUndefined();
  });
});

describe('generateEmbedSnippet', () => {
  it('produces an iframe tag', () => {
    const snippet = generateEmbedSnippet(mockViewport);
    expect(snippet).toContain('<iframe');
    expect(snippet).toContain('</iframe>');
  });

  it('includes viewport in src URL', () => {
    const snippet = generateEmbedSnippet(mockViewport);
    expect(snippet).toContain('y=1776');
    expect(snippet).toContain('s=50');
  });

  it('includes event ID when provided', () => {
    const snippet = generateEmbedSnippet(mockViewport, 'e1');
    expect(snippet).toContain('event=e1');
  });
});
