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
