export type TimePrecision = 'year' | 'quarter' | 'month' | 'week' | 'day' | 'hour' | 'minute';

export interface TimelineEvent {
  id: string;
  title: string;
  year: number; // negative = BCE, positive = CE. Can be fractional for sub-year (e.g. 1969.58 for July 1969)
  emoji: string;
  color: string;
  description: string;
  category: 'cosmic' | 'geological' | 'evolutionary' | 'civilization' | 'modern';
  source: 'anchor' | 'discovered' | 'personal';
  maxSpan?: number; // only show when viewport span <= this

  // Time precision
  timestamp?: string; // ISO 8601 for events with known date/time (e.g. "1969-07-20T20:17:00Z")
  precision?: TimePrecision; // how precise the date is

  // Knowledge
  wiki?: string; // Wikipedia article title
  wikipedia?: {
    summary: string;
    imageUrl: string;
    articleUrl: string;
  };

  // Multimedia
  imageUrl?: string; // primary image
  thumbnailUrl?: string; // small thumbnail for timeline
  videoUrl?: string; // video link (YouTube, Vimeo, etc.)
  audioUrl?: string; // audio narration or related audio
  mediaCaption?: string; // caption for primary media
  mediaCredit?: string; // attribution

  // Geographic data
  lat?: number;
  lng?: number;
  path?: [number, number][]; // [[lat,lng],...] for journeys/routes
  region?: [number, number][]; // [[lat,lng],...] polygon for territories
  geoType?: 'point' | 'path' | 'region' | 'battle' | 'storm';

  // Citations and sourcing
  citations?: Citation[];
  confidence?: 'verified' | 'likely' | 'speculative'; // how certain is this?
  speculativeNote?: string; // if speculative, explain why

  // Connections to other events (causality, influence, etc.)
  connections?: EventConnection[];

  // Themed timelines hint — when an event is dynamically discovered for a
  // user-defined custom theme (via /api/lens/discover), we tag it with the
  // theme id so the parallel-tracks renderer places it on the right track
  // even if the tag-based matcher would otherwise miss it. Built-in themes
  // never use this field — they match purely on tags.
  themeHint?: string;

  // ── Primary-source discovery ────────────────────────────────────────
  // Classifies what *kind* of thing this event is, for the purposes of
  // sourcing. Controls whether primary-source discovery runs at all, and
  // what the AI discovery prompt is allowed to return. Determined by the
  // classifyEvent() helper if not explicitly set.
  //
  //  sentinel    — meta-markers like "Present Day", "You are here". Never
  //                have primary sources. Classifier or UI must never
  //                attempt discovery for these.
  //  prehistoric — events before written history (~10000 BCE). Primary
  //                "sources" are scientific/archaeological, not
  //                historiographic. Discovery skipped by default.
  //  scientific  — scientific discoveries/publications. The primary
  //                source is the original paper / observation record.
  //  cultural    — works of art, literature, music. The work itself IS
  //                the primary source.
  //  historical  — default for everything else in written history.
  sourceClass?: 'sentinel' | 'prehistoric' | 'scientific' | 'cultural' | 'historical';

  // Curated primary sources for headline events. When present, these are
  // used verbatim and the AI discovery path is skipped entirely. Empty
  // array explicitly means "no sources exist" (distinct from undefined
  // which means "ask the discovery pipeline").
  primarySources?: PrimarySource[];
}

/**
 * A primary source document — a letter, newspaper article, court record,
 * scientific paper, chronicle, etc. that was created AT OR NEAR the time
 * of the event by someone with direct knowledge. NOT a modern biography,
 * history book, play, or novel inspired by the event.
 */
export interface PrimarySource {
  title: string;
  url: string;
  /** Year the source was created, NOT the event year. */
  year?: number;
  author?: string;
  type?: 'letter' | 'newspaper' | 'official' | 'witness-account' | 'scientific-paper' | 'legal-document' | 'chronicle' | 'other';
  /** One-sentence explanation of why this is a primary source for THIS event. */
  relevance?: string;
  /**
   * The title actually rendered on the page, extracted by Unbrowser
   * during verification. May differ from `title` because real page
   * titles often include publisher suffixes (e.g. "On the Origin of
   * Species (1859) - Wikisource, the free online library"). Populated
   * only when Unbrowser verification ran; undefined otherwise.
   */
  extractedTitle?: string;
}

export interface Citation {
  source: string;       // "Wikipedia", "Wikidata", "Britannica", "Web Search"
  title: string;        // article/page title
  url?: string;         // link to source
  accessDate?: string;  // when it was accessed
  quote?: string;       // specific passage supporting the claim
}

export interface EventConnection {
  targetId: string;       // id of the connected event
  targetTitle?: string;   // fallback if targetId not found (for AI-generated)
  type: 'caused' | 'influenced' | 'preceded' | 'related' | 'led_to' | 'response_to';
  label?: string;         // e.g. "sparked", "enabled", "resulted in"
}

export interface Viewport {
  centerYear: number;
  span: number; // total years visible
}

export interface Era {
  start: number;
  label: string;
  accent: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TourStop {
  year: number;
  span: number;
  text: string;
}

export interface WikiData {
  title: string;
  extract: string;
  thumb?: string;
  url?: string;
}
