/**
 * Primary source discovery — client side.
 *
 * Replaces the old `searchWikisource(event.title)` path which did a
 * naive full-text match and returned documents that merely shared words
 * with the event title. The new pipeline is:
 *
 *   1. If the event carries curated `primarySources`, use them verbatim.
 *      Editorial control always wins.
 *   2. Classify the event via `classifyEvent(...)`. For sentinel and
 *      prehistoric classes, return [] WITHOUT calling the server — these
 *      events never have primary sources.
 *   3. Otherwise call POST /api/sources/primary, which runs an AI
 *      discovery pass with strict chronology enforcement + URL / type /
 *      predating validation.
 *
 * Results are cached in memory per event id so re-opening an event card
 * doesn't re-spend API budget.
 */

import type { PrimarySource, TimelineEvent } from '../types';
import { classifyEvent, supportsPrimarySources } from '../data/sourceClassification';

// Per-session cache keyed on event id. We key on id because the same
// (title, year) pair could belong to different events if the user has
// multiple timelines or custom themes loaded.
const cache = new Map<string, PrimarySource[]>();

export async function fetchPrimarySources(event: TimelineEvent): Promise<PrimarySource[]> {
  // Curated wins.
  if (event.primarySources !== undefined) return event.primarySources;

  const cached = cache.get(event.id);
  if (cached) return cached;

  const cls = classifyEvent(event);
  if (!supportsPrimarySources(cls)) {
    cache.set(event.id, []);
    return [];
  }

  try {
    const resp = await fetch('/api/sources/primary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: event.title,
        year: event.year,
        description: event.description?.slice(0, 500),
        sourceClass: cls,
      }),
    });
    if (!resp.ok) {
      cache.set(event.id, []);
      return [];
    }
    const data: unknown = await resp.json();
    const sources: unknown = (data as { sources?: unknown }).sources;
    if (!Array.isArray(sources)) {
      cache.set(event.id, []);
      return [];
    }
    // Runtime-narrow each element. The server already validated shape
    // but we don't want to trust the boundary blindly — if anything is
    // missing required fields, drop it.
    const narrowed: PrimarySource[] = [];
    for (const s of sources) {
      if (!s || typeof s !== 'object') continue;
      const obj = s as Record<string, unknown>;
      if (typeof obj.title !== 'string' || typeof obj.url !== 'string') continue;
      narrowed.push({
        title: obj.title,
        url: obj.url,
        year: typeof obj.year === 'number' ? obj.year : undefined,
        author: typeof obj.author === 'string' ? obj.author : undefined,
        type: typeof obj.type === 'string' ? (obj.type as PrimarySource['type']) : undefined,
        relevance: typeof obj.relevance === 'string' ? obj.relevance : undefined,
      });
    }
    cache.set(event.id, narrowed);
    return narrowed;
  } catch {
    // Transient network failures aren't cached — user may retry by
    // closing and re-opening the event card.
    return [];
  }
}
