import { describe, it, expect } from 'vitest';
import type { TimelineEvent } from '../../types';
import {
  THEMES,
  THEMES_BY_ID,
  getEventThemes,
  findMultiThemeConvergences,
  findThreadConvergences,
  makeCustomTheme,
  mergeThemes,
  resolveActiveThemes,
} from '../themes';

function mk(partial: Partial<TimelineEvent> & { id: string; title: string }): TimelineEvent {
  return {
    year: 1900,
    emoji: '⭐',
    color: '#fff',
    description: '',
    category: 'modern',
    source: 'anchor',
    ...partial,
  };
}

describe('themes registry', () => {
  it('exposes six themes', () => {
    expect(THEMES).toHaveLength(6);
  });

  it('every theme has the required fields', () => {
    for (const t of THEMES) {
      expect(t.id).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.emoji).toBeTruthy();
      expect(t.color).toMatch(/^#/);
      expect(Array.isArray(t.tags)).toBe(true);
      expect(t.tags.length).toBeGreaterThan(0);
    }
  });

  it('THEMES_BY_ID contains every theme', () => {
    for (const t of THEMES) {
      expect(THEMES_BY_ID[t.id]).toBe(t);
    }
  });

  it('theme ids are unique', () => {
    const ids = THEMES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getEventThemes', () => {
  it('matches science events to the science theme', () => {
    const ev = mk({
      id: 'e1',
      title: "Darwin's Evolution",
      description: 'Natural selection',
    });
    expect(getEventThemes(ev)).toContain('science');
  });

  it('matches war events to the war theme', () => {
    const ev = mk({
      id: 'e2',
      title: 'World War I',
      description: 'A war that shattered empires',
    });
    expect(getEventThemes(ev)).toContain('war');
  });

  it('multi-theme events surface every matching theme', () => {
    // The atomic bomb straddles science (atomic), war (bomb), and tech.
    const ev = mk({
      id: 'e3',
      title: 'Atomic Bomb',
      description: 'An atomic bomb weapon ends the war',
    });
    const themes = getEventThemes(ev);
    expect(themes).toContain('war');
    // At least two themes should fire for an event this overloaded.
    expect(themes.length).toBeGreaterThanOrEqual(2);
  });

  it('events with no thematic keywords return no matches', () => {
    const ev = mk({
      id: 'e4',
      title: 'Nothing',
      description: 'Nothing relevant at all',
    });
    expect(getEventThemes(ev)).toHaveLength(0);
  });
});

describe('findMultiThemeConvergences', () => {
  it('returns empty when fewer than two themes are active', () => {
    const ev = mk({ id: 'e1', title: 'Atomic Bomb', description: 'atomic weapon' });
    expect(findMultiThemeConvergences([ev], new Set(['war']))).toEqual([]);
  });

  it('reports an event that belongs to two active themes', () => {
    const ev = mk({
      id: 'e1',
      title: 'Printing Press',
      description: 'A printing press invention that reshaped religion',
    });
    const cv = findMultiThemeConvergences([ev], new Set(['tech', 'belief']));
    expect(cv).toHaveLength(1);
    expect(cv[0].event.id).toBe('e1');
    expect(cv[0].themeIds).toEqual(expect.arrayContaining(['tech', 'belief']));
  });

  it('ignores events whose only matches are in inactive themes', () => {
    const ev = mk({
      id: 'e2',
      title: 'Renaissance Painting',
      description: 'Art masterpiece from the renaissance',
    });
    // Art matches, science matches? No. So only one active theme would fire.
    const cv = findMultiThemeConvergences([ev], new Set(['art', 'science']));
    expect(cv).toHaveLength(0);
  });
});

describe('findThreadConvergences', () => {
  it('links events in different themes via connections', () => {
    const newton = mk({
      id: 'newton',
      title: "Newton's Principia",
      description: 'Physics mathematics',
      connections: [{ targetId: 'einstein', type: 'influenced', label: 'set the stage' }],
    });
    const einstein = mk({
      id: 'einstein',
      title: "Einstein's Relativity",
      description: 'Physics relativity theory',
    });
    const threads = findThreadConvergences([newton, einstein], new Set(['science', 'tech']));
    // Newton → Einstein is within science, same theme — should NOT emit a cross-theme thread.
    expect(threads).toHaveLength(0);
  });

  it('emits a thread when from/to land on different themes', () => {
    const press = mk({
      id: 'press',
      title: 'Gutenberg Press',
      description: 'Printing press invention',
      connections: [{ targetId: 'ref', type: 'led_to', label: 'enabled' }],
    });
    const reformation = mk({
      id: 'ref',
      title: 'Reformation',
      description: 'Religion schism in the church',
    });
    const threads = findThreadConvergences([press, reformation], new Set(['tech', 'belief']));
    expect(threads).toHaveLength(1);
    expect(threads[0].fromTheme).toBe('tech');
    expect(threads[0].toTheme).toBe('belief');
  });
});

describe('makeCustomTheme', () => {
  it('assigns a custom- prefixed id from the label', () => {
    const t = makeCustomTheme({ label: 'Influence of Mathematics' });
    expect(t.id).toBe('custom-influence-of-mathematics');
    expect(t.custom).toBe(true);
  });

  it('uses supplied id when editing', () => {
    const t = makeCustomTheme({ id: 'custom-existing', label: 'Whatever' });
    expect(t.id).toBe('custom-existing');
  });

  it('lowercases and dedupes tag whitespace', () => {
    const t = makeCustomTheme({
      label: 'test',
      tags: ['  Gold ', 'ALCHEMY', 'mercury  '],
    });
    expect(t.tags).toEqual(['gold', 'alchemy', 'mercury']);
  });

  it('falls back to defaults for missing fields', () => {
    const t = makeCustomTheme({ label: 'x' });
    expect(t.emoji).toBeTruthy();
    expect(t.color).toMatch(/^#/);
    expect(t.tags).toEqual([]);
  });
});

describe('mergeThemes + resolveActiveThemes', () => {
  it('merges built-ins with customs preserving order', () => {
    const custom = makeCustomTheme({ label: 'Color blue' });
    const merged = mergeThemes([custom]);
    expect(merged).toHaveLength(THEMES.length + 1);
    expect(merged[merged.length - 1]).toBe(custom);
  });

  it('resolves an id set into a theme list (built-in + custom)', () => {
    const custom = makeCustomTheme({ label: 'Color blue' });
    const ids = new Set(['science', custom.id]);
    const resolved = resolveActiveThemes(ids, [custom]);
    expect(resolved).toHaveLength(2);
    expect(resolved.map(t => t.id)).toEqual(['science', custom.id]);
  });

  it('drops unknown ids', () => {
    const resolved = resolveActiveThemes(new Set(['science', 'not-a-theme']), []);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe('science');
  });
});

describe('getEventThemes + themeHint', () => {
  it('honors themeHint even when tag matching would miss', () => {
    const custom = makeCustomTheme({ label: 'Color blue', tags: ['ultramarine'] });
    const ev = mk({
      id: 'h1',
      title: 'Lapis lazuli trade',
      description: 'Afghan stone crossed the silk road',
      themeHint: custom.id,
    });
    const themes = getEventThemes(ev, mergeThemes([custom]));
    expect(themes).toContain(custom.id);
  });

  it('still applies normal tag matching when themeHint is set', () => {
    const custom = makeCustomTheme({ label: 'Color blue', tags: ['pigment'] });
    const ev = mk({
      id: 'h2',
      title: "Newton's Principia",
      description: 'Physics and mathematics',
      themeHint: custom.id,
    });
    const themes = getEventThemes(ev, mergeThemes([custom]));
    // Both the hint theme and the built-in science theme should fire.
    expect(themes).toContain(custom.id);
    expect(themes).toContain('science');
  });

  it('a custom theme with no tags only matches via themeHint', () => {
    const custom = makeCustomTheme({ label: 'Empty theme', tags: [] });
    const evHint = mk({ id: 'h3', title: 'Random', description: 'random', themeHint: custom.id });
    const evNoHint = mk({ id: 'h4', title: 'Random', description: 'random' });
    const themes = mergeThemes([custom]);
    expect(getEventThemes(evHint, themes)).toContain(custom.id);
    expect(getEventThemes(evNoHint, themes)).not.toContain(custom.id);
  });
});
