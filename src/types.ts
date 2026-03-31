export type TimePrecision = 'year' | 'quarter' | 'month' | 'week' | 'day' | 'hour' | 'minute';

export interface TimelineEvent {
  id: string;
  title: string;
  year: number; // negative = BCE, positive = CE. Can be fractional for sub-year (e.g. 1969.58 for July 1969)
  emoji: string;
  color: string;
  description: string;
  category: 'cosmic' | 'geological' | 'evolutionary' | 'civilization' | 'modern';
  source: 'anchor' | 'discovered';
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
