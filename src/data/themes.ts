/**
 * Parallel Themed Timelines
 *
 * Splits the timeline into multiple themed tracks that run in parallel.
 * Unlike a single lens (which filters the whole timeline to one topic) or
 * region lanes (which split by geography), themes let the user watch
 * Science, Art, War, etc. unfold *at the same time* on stacked tracks, and
 * see where those threads **converge** — i.e. events that belong to more
 * than one theme, or causally link events across themes.
 *
 * A theme is a tag-based filter over the event corpus. Matching is the
 * same substring-contains check used by lenses, so the same anchor data
 * feeds both features without any re-tagging.
 */

import type { TimelineEvent } from '../types';

export interface TimelineTheme {
  id: string;
  label: string;
  emoji: string;
  color: string;
  /** Lowercase substrings searched against title / description / category. */
  tags: string[];
  /** User-authored themes carry this flag so the UI can show a delete action. */
  custom?: boolean;
  /**
   * Long-form description, used as prompt context when a custom theme is
   * sent to /api/lens/discover. Built-in themes don't need one.
   */
  description?: string;
}

/**
 * Six broad themes — enough to produce interesting parallels without
 * cluttering the canvas when the user enables them all at once.
 *
 * Colors intentionally borrow from the existing lens palette so an event
 * that's "science-flavored" reads the same whether it's surfaced via a
 * lens or a themed track.
 */
export const THEMES: TimelineTheme[] = [
  {
    id: 'science',
    label: 'Science & Discovery',
    emoji: '🔬',
    color: '#4169e1',
    tags: [
      'science', 'discovery', 'physics', 'chemistry', 'biology', 'astronomy',
      'experiment', 'theory', 'mathematics', 'evolution', 'relativity',
      'dna', 'darwin', 'newton', 'einstein', 'copernicus', 'galileo',
      'photosynthesis', 'eukaryote', 'oxygenation', 'cambrian',
      'atomic', 'nuclear', 'quantum',
    ],
  },
  {
    id: 'art',
    label: 'Art & Culture',
    emoji: '🎨',
    color: '#ff69b4',
    tags: [
      'art', 'painting', 'sculpture', 'music', 'literature', 'renaissance',
      'baroque', 'impressionism', 'cave art', 'theatre', 'poetry',
      'symphony', 'novel', 'opera', 'masterpiece',
    ],
  },
  {
    id: 'war',
    label: 'War & Conflict',
    emoji: '⚔️',
    color: '#dc143c',
    tags: [
      'war', 'battle', 'siege', 'invasion', 'conquest', 'army', 'military',
      'revolt', 'revolution', 'atomic bomb', 'bomb', 'weapon', 'warrior',
      'hastings', 'ww1', 'ww2', 'world war', 'alexander', 'caesar',
    ],
  },
  {
    id: 'power',
    label: 'Power & Politics',
    emoji: '🏛️',
    color: '#9370db',
    tags: [
      'empire', 'king', 'queen', 'emperor', 'democracy', 'republic',
      'constitution', 'independence', 'magna carta', 'revolution', 'treaty',
      'senate', 'parliament', 'citizen', 'throne', 'dynasty',
      'assassination', 'coronation',
    ],
  },
  {
    id: 'tech',
    label: 'Technology',
    emoji: '⚙️',
    color: '#ff8c00',
    tags: [
      'technology', 'invention', 'machine', 'engineering', 'printing press',
      'printing', 'press', 'electricity', 'electric', 'computer', 'internet',
      'flight', 'aircraft', 'telegraph', 'steam', 'wheel', 'fire',
      'agriculture', 'writing', 'alphabet', 'industrial',
    ],
  },
  {
    id: 'belief',
    label: 'Religion & Thought',
    emoji: '🕌',
    color: '#daa520',
    tags: [
      'religion', 'church', 'temple', 'prophet', 'philosophy', 'faith',
      'islam', 'christianity', 'buddhism', 'hinduism', 'judaism',
      'monastery', 'reformation', 'theology', 'scripture', 'crusade',
      'muhammad', 'jesus', 'buddha', 'plato', 'socrates', 'democracy',
    ],
  },
];

/** Theme lookup by id. */
export const THEMES_BY_ID: Record<string, TimelineTheme> = Object.fromEntries(
  THEMES.map(t => [t.id, t]),
);

/**
 * Return the ids of every theme a given event matches. Events often match
 * several — the Manhattan Project is science *and* war *and* tech — and
 * that overlap is exactly what "convergence" visualizes.
 *
 * When the event carries a `themeHint` set (custom theme discovery path),
 * that theme is always included if it's in the active list — otherwise an
 * AI-discovered "architecture of sound" event might fail keyword matching
 * against its own theme tags and drop off the track it was fetched for.
 */
export function getEventThemes(ev: TimelineEvent, themes: TimelineTheme[] = THEMES): string[] {
  // Guard each field with ?? '' — TimelineEvent's description and category
  // are both optional, and letting the template literal stringify undefined
  // leaks the literal word "undefined" into the haystack, which could then
  // false-match any theme tag containing a substring like "fine" or "def".
  const haystack = `${ev.title ?? ''} ${ev.description ?? ''} ${ev.category ?? ''}`.toLowerCase();
  const matches: string[] = [];
  const hint = ev.themeHint;
  for (const theme of themes) {
    if (hint && theme.id === hint) {
      matches.push(theme.id);
      continue;
    }
    if (theme.tags.length > 0 && theme.tags.some(tag => haystack.includes(tag))) {
      matches.push(theme.id);
    }
  }
  return matches;
}

/**
 * Build a `TimelineTheme` from a user-supplied label + description +
 * optional tag string. Id is a stable slug prefixed with `custom-` so
 * custom themes never collide with built-ins. Missing fields get sane
 * defaults (random color, magnifying-glass emoji, empty tag list).
 */
export function makeCustomTheme(input: {
  label: string;
  description?: string;
  emoji?: string;
  color?: string;
  tags?: string[];
  id?: string;
}): TimelineTheme {
  const slug = input.label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const id = input.id || `custom-${slug || Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    label: input.label.trim() || 'Untitled thread',
    emoji: input.emoji || '✨',
    color: input.color || '#14b8a6',
    tags: (input.tags || []).map(t => t.toLowerCase().trim()).filter(Boolean),
    description: input.description?.trim() || '',
    custom: true,
  };
}

/** Merge built-in themes with a list of user-authored themes. */
export function mergeThemes(custom: TimelineTheme[] = []): TimelineTheme[] {
  return [...THEMES, ...custom];
}

/** Resolve a Set of theme ids into a theme list, preserving display order. */
export function resolveActiveThemes(
  ids: Set<string>,
  custom: TimelineTheme[] = [],
): TimelineTheme[] {
  const all = mergeThemes(custom);
  return all.filter(t => ids.has(t.id));
}

/**
 * A convergence point: an event that lives on two or more themed tracks
 * at the same moment. The renderer draws a curve that unites the tracks
 * at this x-coordinate so the eye can follow the event vertically across
 * the themes it touches.
 */
export interface Convergence {
  event: TimelineEvent;
  themeIds: string[];
}

/**
 * Scan a list of events and return every event that matches ≥2 active
 * themes. Only events inside `activeThemes` are considered — we never
 * report a convergence that the user can't see.
 *
 * `themes` defaults to the built-in registry; pass a merged list when
 * custom user-authored themes are in play so they participate in
 * convergence detection alongside the built-ins.
 */
export function findMultiThemeConvergences(
  events: TimelineEvent[],
  activeThemes: Set<string>,
  themes: TimelineTheme[] = THEMES,
): Convergence[] {
  if (activeThemes.size < 2) return [];
  const out: Convergence[] = [];
  for (const ev of events) {
    const themeIds = getEventThemes(ev, themes).filter(id => activeThemes.has(id));
    if (themeIds.length >= 2) out.push({ event: ev, themeIds });
  }
  return out;
}

/**
 * A directed convergence between two events that sit on different themed
 * tracks but are linked through an `ev.connections` edge. These are the
 * "timeline threads" that cross from one theme to another — e.g. Newton
 * (science) "influenced" Einstein (science/tech), or the printing press
 * (tech) "led_to" the Reformation (belief).
 */
export interface ThreadConvergence {
  from: TimelineEvent;
  to: TimelineEvent;
  fromTheme: string;
  toTheme: string;
  label?: string;
}

/**
 * Find cross-theme connection arcs. For each event on an active track, we
 * walk its `connections` and emit a thread whenever the target lands on a
 * *different* active theme. We pick the first theme each event matches to
 * keep the visual uncluttered (multi-theme events already get a
 * convergence from `findMultiThemeConvergences`).
 */
export function findThreadConvergences(
  events: TimelineEvent[],
  activeThemes: Set<string>,
  themes: TimelineTheme[] = THEMES,
): ThreadConvergence[] {
  if (activeThemes.size < 2) return [];
  const byId = new Map(events.map(e => [e.id, e]));
  const byTitle = new Map(events.map(e => [e.title, e]));
  const firstActiveTheme = (ev: TimelineEvent): string | null => {
    for (const id of getEventThemes(ev, themes)) {
      if (activeThemes.has(id)) return id;
    }
    return null;
  };

  const out: ThreadConvergence[] = [];
  for (const ev of events) {
    if (!ev.connections) continue;
    const fromTheme = firstActiveTheme(ev);
    if (!fromTheme) continue;
    for (const conn of ev.connections) {
      const target = byId.get(conn.targetId) || (conn.targetTitle ? byTitle.get(conn.targetTitle) : undefined);
      if (!target) continue;
      const toTheme = firstActiveTheme(target);
      if (!toTheme || toTheme === fromTheme) continue;
      out.push({ from: ev, to: target, fromTheme, toTheme, label: conn.label });
    }
  }
  return out;
}
