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
 */
export function getEventThemes(ev: TimelineEvent, themes: TimelineTheme[] = THEMES): string[] {
  const haystack = `${ev.title} ${ev.description} ${ev.category}`.toLowerCase();
  const matches: string[] = [];
  for (const theme of themes) {
    if (theme.tags.some(tag => haystack.includes(tag))) {
      matches.push(theme.id);
    }
  }
  return matches;
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
 */
export function findMultiThemeConvergences(
  events: TimelineEvent[],
  activeThemes: Set<string>,
): Convergence[] {
  if (activeThemes.size < 2) return [];
  const out: Convergence[] = [];
  for (const ev of events) {
    const themeIds = getEventThemes(ev).filter(id => activeThemes.has(id));
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
): ThreadConvergence[] {
  if (activeThemes.size < 2) return [];
  const byId = new Map(events.map(e => [e.id, e]));
  const byTitle = new Map(events.map(e => [e.title, e]));
  const firstActiveTheme = (ev: TimelineEvent): string | null => {
    for (const id of getEventThemes(ev)) {
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
