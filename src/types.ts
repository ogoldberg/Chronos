export interface TimelineEvent {
  id: string;
  title: string;
  year: number; // negative = BCE, positive = CE
  emoji: string;
  color: string;
  description: string;
  category: 'cosmic' | 'geological' | 'evolutionary' | 'civilization' | 'modern';
  source: 'anchor' | 'discovered';
  maxSpan?: number; // only show when span <= this
  wiki?: string; // Wikipedia article title
  wikipedia?: {
    summary: string;
    imageUrl: string;
    articleUrl: string;
  };
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
