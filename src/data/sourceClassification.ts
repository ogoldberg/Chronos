/**
 * Source classification — decides what KIND of event something is for
 * the purposes of primary-source discovery. Used by both the client-side
 * discovery service and the server-side /api/sources/primary route to
 * decide whether to attempt discovery at all, and what prompt to use.
 *
 * The classifier is a pure function. Explicit `event.sourceClass` always
 * wins. Otherwise we fall back to category mapping, then a year-based
 * heuristic, then 'historical' as the last-resort default.
 *
 * This is deliberately simple: the LLM on the server side handles the
 * nuance. Our job here is just to route events down the right pipeline
 * and short-circuit the cases where no sources are appropriate.
 */

import type { TimelineEvent } from '../types';

export type SourceClass =
  | 'sentinel'    // meta-marker, no sources ever
  | 'prehistoric' // before written history, only archaeological/scientific
  | 'scientific'  // scientific discovery/publication
  | 'cultural'    // literature/art/music — the work itself IS the source
  | 'historical'; // default for written-history events

/**
 * Threshold beneath which an event is considered prehistoric. Written
 * historical records don't extend meaningfully earlier than ~3000 BCE
 * (Sumerian cuneiform, Egyptian hieroglyphs), but oral tradition and
 * contemporary chronicles about earlier events do exist for the late
 * Neolithic. We use -10000 as a generous lower bound — anything before
 * the Younger Dryas / agricultural revolution has no primary sources
 * in the historiographic sense.
 */
const PREHISTORIC_BEFORE_YEAR = -10000;

/**
 * Events with category 'cosmic', 'geological', or 'evolutionary' are all
 * pre-human and thus fundamentally not amenable to traditional primary-
 * source lookup. We route them through the 'prehistoric' class — the
 * server then returns [] without calling the AI at all. If we ever want
 * to surface *scientific* papers for cosmic events (e.g. the original
 * Hubble observation paper for "Universe Expanding"), we can add a
 * scientific-era override in anchorEvents.ts via explicit `sourceClass`.
 */
const CATEGORY_MAP: Record<TimelineEvent['category'], SourceClass> = {
  cosmic: 'prehistoric',
  geological: 'prehistoric',
  evolutionary: 'prehistoric',
  civilization: 'historical',
  modern: 'historical',
};

export function classifyEvent(event: Pick<TimelineEvent, 'sourceClass' | 'category' | 'year'>): SourceClass {
  // 1. Explicit field wins unconditionally.
  if (event.sourceClass) return event.sourceClass;

  // 2. Year-based prehistory check — runs before category mapping so
  //    that a "civilization"-categorized event that sneaks in at an
  //    impossibly early year still gets routed correctly.
  if (event.year < PREHISTORIC_BEFORE_YEAR) return 'prehistoric';

  // 3. Category fallback.
  if (event.category && CATEGORY_MAP[event.category]) return CATEGORY_MAP[event.category];

  // 4. Default.
  return 'historical';
}

/**
 * Does this source class ever produce primary-source results?
 * Used by the client to decide whether to even make the API call, and
 * by the UI to decide whether to render the "Primary Sources" section
 * header at all.
 */
export function supportsPrimarySources(cls: SourceClass): boolean {
  // Sentinel and prehistoric never produce sources. Historical, scientific,
  // and cultural all do (though cultural often resolves to "the work itself").
  return cls !== 'sentinel' && cls !== 'prehistoric';
}
