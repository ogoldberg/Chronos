import { callAI } from '../ai/callAI';
import { PRIMARY_SOURCES_SYSTEM } from '../ai/prompts';

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
    // Call the AI directly — no server in the path. The prompt does all
    // the enforcement; we take what it returns, run the same runtime
    // sanity checks the server used to run, and hand the result back.
    const description = event.description?.slice(0, 500);
    // Narrow the SourceClass to the three values PRIMARY_SOURCES_SYSTEM accepts.
    // supportsPrimarySources() already filtered out the other cases above.
    const narrowCls = cls as 'historical' | 'scientific' | 'cultural';
    const system = PRIMARY_SOURCES_SYSTEM(event.title, event.year, description, narrowCls);
    const userMessage = `Find primary sources for: ${event.title} (${event.year < 0 ? `${Math.abs(event.year)} BCE` : `${event.year} CE`})`;
    const { text } = await callAI(system, [{ role: 'user', content: userMessage }], {
      maxTokens: 2000,
      webSearch: true,
    });

    const jsonMatch = text.match(/\{[\s\S]*"sources"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
    if (!jsonMatch) {
      cache.set(event.id, []);
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      cache.set(event.id, []);
      return [];
    }
    const arr = (parsed as { sources?: unknown }).sources;
    if (!Array.isArray(arr)) {
      cache.set(event.id, []);
      return [];
    }

    // Runtime-narrow each element, dedupe by URL, and drop entries that
    // postdate the event (can't be a primary source for something that
    // hadn't happened yet). Same checks the old server route ran — they
    // belong in user space now.
    const seen = new Set<string>();
    const narrowed: PrimarySource[] = [];
    for (const s of arr) {
      if (!s || typeof s !== 'object') continue;
      const obj = s as Record<string, unknown>;
      if (typeof obj.title !== 'string' || typeof obj.url !== 'string') continue;
      if (seen.has(obj.url)) continue;
      // URL must parse as a real https URL (relative or malformed is hallucinated).
      try {
        const u = new URL(obj.url);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') continue;
      } catch { continue; }
      // Year sanity: primary source must predate OR equal the event year.
      const sYear = typeof obj.year === 'number' ? obj.year : undefined;
      if (sYear !== undefined && sYear > event.year) continue;
      seen.add(obj.url);
      narrowed.push({
        title: obj.title,
        url: obj.url,
        year: sYear,
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
