/**
 * Custom Theme Discovery Hook
 *
 * When themed-timelines mode is on and the user has one or more custom
 * themes enabled, this hook watches the viewport and calls
 * /api/lens/discover for each custom theme to populate its track with
 * topic-relevant events. Results are merged back into the shared
 * timeline store via `addEvents` so they participate in clustering,
 * convergence detection, and the period card alongside everything else.
 *
 * Caching strategy: keyed by `${themeId}:${coarseCellId}`, where
 * `coarseCellId` bins the viewport center to a power-of-ten window that
 * scales with the current span. This way a gentle pan re-uses the
 * previous fetch, but zooming out or jumping eras triggers a fresh one.
 *
 * The hook is deliberately independent of the standard
 * `eventDiscovery.ts` pipeline — that one fetches general events from
 * /api/discover, we fetch lens-scoped events from /api/lens/discover.
 * Both dump into the same store bucket, and `themeHint` on each fetched
 * event keeps the parallel-tracks renderer honest about which track the
 * event belongs on.
 */

import { useEffect, useRef } from 'react';
import type { Viewport, TimelineEvent } from '../../types';
import type { TimelineTheme } from '../../data/themes';
import { useTimelineStore } from '../../stores/timelineStore';

interface DiscoveryOptions {
  enabled: boolean;
  viewport: Viewport;
  activeThemes: TimelineTheme[];
}

/** Bin a viewport to a coarse cell keyed by center + span magnitude. */
function cellKeyForViewport(vp: Viewport): string {
  // Cell size is ~20% of the current span, so a small pan stays in the
  // same cell while a big zoom re-bins. `log10(span)` rounded gives a
  // stable span tier that doesn't flicker on tiny float jitter.
  const cellSize = Math.max(1, Math.floor(vp.span * 0.2));
  const cellIdx = Math.floor(vp.centerYear / cellSize);
  const tier = Math.round(Math.log10(Math.max(1, vp.span)));
  return `${tier}:${cellIdx}`;
}

export function useCustomThemeDiscovery({
  enabled,
  viewport,
  activeThemes,
}: DiscoveryOptions) {
  // Cache of `${themeId}:${cellKey}` → status, survives across renders.
  const cacheRef = useRef<Map<string, 'pending' | 'loaded' | 'error'>>(new Map());
  const debounceRef = useRef<number>(0);
  // Track the live AbortController so a rapid viewport change cancels
  // in-flight requests instead of piling up.
  const inflightRef = useRef<AbortController | null>(null);

  // Read addEvents off the store the lazy way so this hook doesn't
  // need to subscribe to the whole store — we only need to *write*.
  const addEvents = useTimelineStore(s => s.addEvents);

  useEffect(() => {
    if (!enabled) return;
    // Only user-authored themes trigger an API call — built-ins work
    // off the shared dataset and don't need per-topic discovery.
    const customs = activeThemes.filter(t => t.custom);
    if (customs.length === 0) return;

    clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const cellKey = cellKeyForViewport(viewport);
      const halfSpan = viewport.span / 2;
      const startYear = Math.round(viewport.centerYear - halfSpan);
      const endYear = Math.round(viewport.centerYear + halfSpan);

      // Cancel any still-inflight batch from a previous viewport.
      inflightRef.current?.abort();
      const controller = new AbortController();
      inflightRef.current = controller;

      for (const theme of customs) {
        const key = `${theme.id}:${cellKey}`;
        if (cacheRef.current.get(key)) continue; // already pending / loaded / errored
        cacheRef.current.set(key, 'pending');

        // Build a lens-shaped payload. Description is fed via `name`
        // on the prompt side and forwarded as additional context in
        // the user message — the server /api/lens/discover endpoint
        // only requires { name, tags }, description is optional.
        const body = {
          lens: {
            name: theme.label,
            description: theme.description || '',
            // Fall back to the label as a tag if the user didn't supply
            // any — the backend requires >=1 tag to match.
            tags: theme.tags.length > 0 ? theme.tags : [theme.label.toLowerCase()],
          },
          startYear,
          endYear,
          count: 8,
        };

        fetch('/api/lens/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
          .then(async resp => {
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const raw: unknown[] = Array.isArray(data?.events) ? data.events : [];
            const fresh: TimelineEvent[] = raw
              .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
              .filter(e => typeof e.title === 'string' && typeof e.year === 'number')
              .map((e, i) => ({
                id: `theme-${theme.id}-${startYear}-${i}-${Date.now()}`,
                title: String(e.title),
                year: Number(e.year),
                emoji: (e.emoji as string | undefined) || theme.emoji,
                color: (e.color as string | undefined) || theme.color,
                description: (e.description as string | undefined) || '',
                category: ((e.category as TimelineEvent['category']) || 'modern'),
                source: 'discovered' as const,
                wiki: e.wiki as string | undefined,
                lat: e.lat as number | undefined,
                lng: e.lng as number | undefined,
                themeHint: theme.id,
              }));
            if (fresh.length > 0) addEvents(fresh);
            cacheRef.current.set(key, 'loaded');
          })
          .catch((err: unknown) => {
            // Aborted fetches aren't errors — they just mean the user
            // panned past this cell before it resolved. Crucially we
            // must DELETE the cache entry (not leave it 'pending') so
            // the next time the user lands on this cell we retry the
            // fetch. Leaving it 'pending' made the common case (rapid
            // panning constantly bouncing the debounce) silently stop
            // loading custom-theme events.
            if (err instanceof DOMException && err.name === 'AbortError') {
              cacheRef.current.delete(key);
              return;
            }
            cacheRef.current.set(key, 'error');
            // Still-errored cells get one retry window: clear them after
            // 30s so the next viewport visit attempts a fresh fetch.
            setTimeout(() => cacheRef.current.delete(key), 30_000);
          });
      }
    }, 700);

    return () => clearTimeout(debounceRef.current);
  }, [enabled, viewport, activeThemes, addEvents]);

  // When a theme is removed, drop its cache entries so the user can
  // re-create a theme with the same id without stale data.
  useEffect(() => {
    const activeIds = new Set(activeThemes.map(t => t.id));
    for (const key of cacheRef.current.keys()) {
      const themeId = key.split(':')[0];
      if (!activeIds.has(themeId)) cacheRef.current.delete(key);
    }
  }, [activeThemes]);
}
