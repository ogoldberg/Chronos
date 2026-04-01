/**
 * Export utilities for CHRONOS
 *
 * Supports:
 * - Canvas screenshot (PNG)
 * - Event data export (JSON)
 * - Embed URL generation
 * - Share card generation
 */

import type { TimelineEvent, Viewport } from '../types';
import { formatYear } from './format';

/**
 * Export the timeline canvas as a PNG image.
 */
export function exportCanvasImage(): Promise<Blob | null> {
  return new Promise((resolve) => {
    const canvas = document.querySelector('canvas');
    if (!canvas) { resolve(null); return; }
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

/**
 * Download a blob as a file.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export visible events as JSON.
 */
export function exportEventsJSON(events: TimelineEvent[], viewport: Viewport): string {
  const exportData = {
    chronos: {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      viewport: {
        centerYear: viewport.centerYear,
        span: viewport.span,
        range: `${formatYear(viewport.centerYear - viewport.span / 2)} → ${formatYear(viewport.centerYear + viewport.span / 2)}`,
      },
      eventCount: events.length,
    },
    events: events.map(e => ({
      title: e.title,
      year: e.year,
      timestamp: e.timestamp,
      description: e.description,
      category: e.category,
      source: e.source,
      wiki: e.wiki,
      confidence: e.confidence,
      citations: e.citations,
      lat: e.lat,
      lng: e.lng,
      connections: e.connections,
    })),
  };
  return JSON.stringify(exportData, null, 2);
}

/**
 * Generate an embed URL for the current view.
 */
export function generateEmbedURL(viewport: Viewport, eventId?: string): string {
  const params = new URLSearchParams();
  params.set('y', String(viewport.centerYear));
  params.set('s', String(viewport.span));
  if (eventId) params.set('event', eventId);
  params.set('embed', '1');
  return `${window.location.origin}/embed?${params.toString()}`;
}

/**
 * Generate an embed HTML snippet.
 */
export function generateEmbedSnippet(viewport: Viewport, eventId?: string): string {
  const url = generateEmbedURL(viewport, eventId);
  return `<iframe src="${url}" width="800" height="500" frameborder="0" style="border-radius:12px;border:1px solid #1a1a2e;" allow="autoplay"></iframe>`;
}

/**
 * Copy text to clipboard with fallback.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  }
}
