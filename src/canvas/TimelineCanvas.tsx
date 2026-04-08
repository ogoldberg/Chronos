import { useRef, useEffect, useCallback, useState } from 'react';
import type { TimelineEvent, Viewport } from '../types';
import type { TimelineTheme } from '../data/themes';
import type { ProposedThread } from '../stores/timelineStore';
import { zoomAtCursor, pan, pixelToYear } from './viewport';
import { renderTimeline, type HitTarget } from './renderer';

interface Props {
  viewport: Viewport;
  events: TimelineEvent[];
  selectedId: string | null;
  activeLanes?: Set<string>;
  /** Resolved list of active themed tracks (built-in + custom). */
  activeThemes?: TimelineTheme[];
  /** AI-validated user-proposed convergences, drawn as distinct arcs. */
  proposedThreads?: ProposedThread[];
  onViewportChange: (vp: Viewport) => void;
  onSelectEvent: (ev: TimelineEvent | null) => void;
  onHoverEvent: (ev: TimelineEvent | null) => void;
  // Fired when the user clicks empty space on the timeline (i.e. not on an
  // event or cluster). Used to surface a "what was happening here" period card.
  onSelectPeriod?: (year: number) => void;
}

export default function TimelineCanvas({
  viewport,
  events,
  selectedId,
  activeLanes,
  activeThemes,
  proposedThreads,
  onViewportChange,
  onSelectEvent,
  onHoverEvent,
  onSelectPeriod,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 1200, h: 700 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hitTargetsRef = useRef<HitTarget[]>([]);
  // Drag state. `startX` tracks the last pointer position and is advanced on
  // every pan step so we can compute the incremental delta. `totalMoved`
  // accumulates the absolute distance moved since mousedown — this is what
  // we consult on mouseup to decide whether the gesture was a click or a
  // drag. We can't use `clientX - startX` on mouseup because startX has
  // already been advanced to the current cursor, making the delta zero
  // even after a long drag.
  const dragRef = useRef({ active: false, startX: 0, totalMoved: 0 });
  const pinchRef = useRef({ active: false, dist0: 0, span0: 0 });

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: width, h: height });
    });
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dims.w * dpr;
    canvas.height = dims.h * dpr;
    canvas.style.width = `${dims.w}px`;
    canvas.style.height = `${dims.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    hitTargetsRef.current = renderTimeline(
      ctx,
      viewport,
      events,
      dims.w,
      dims.h,
      hoveredId,
      selectedId,
      activeLanes,
      activeThemes,
      proposedThreads,
    );
  }, [viewport, events, dims, hoveredId, selectedId, activeLanes, activeThemes, proposedThreads]);

  // Wheel zoom
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cursorX = e.clientX - rect.left;
      onViewportChange(zoomAtCursor(viewport, cursorX, dims.w, e.deltaY));
    },
    [viewport, dims.w, onViewportChange]
  );

  // Mouse drag
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { active: true, startX: e.clientX, totalMoved: 0 };
  }, []);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Hit test for hover
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let found: TimelineEvent | null = null;
      for (const ht of hitTargetsRef.current) {
        const dx = mx - ht.x;
        const dy = my - ht.y;
        if (dx * dx + dy * dy < 400) {
          found = ht.event;
          break;
        }
      }
      setHoveredId(found?.id ?? null);
      onHoverEvent(found);
      if (canvasRef.current) {
        canvasRef.current.style.cursor = found ? 'pointer' : dragRef.current.active ? 'grabbing' : 'grab';
      }

      // Drag panning
      if (dragRef.current.active) {
        const dx = e.clientX - dragRef.current.startX;
        if (Math.abs(dx) > 1) {
          onViewportChange(pan(viewport, dx, dims.w));
          dragRef.current.startX = e.clientX;
          dragRef.current.totalMoved += Math.abs(dx);
        }
      }
    },
    [viewport, dims.w, onViewportChange, onHoverEvent]
  );

  const onMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!dragRef.current.active) return;
      const moved = dragRef.current.totalMoved;
      dragRef.current.active = false;

      // If barely moved, treat as click
      if (moved < 5) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        let found: typeof hitTargetsRef.current[0] | null = null;
        for (const ht of hitTargetsRef.current) {
          const dx = mx - ht.x;
          const dy = my - ht.y;
          if (dx * dx + dy * dy < 400) {
            found = ht;
            break;
          }
        }
        if (found?.cluster && found.cluster.length > 1) {
          // Clicked a cluster — zoom in to see individual events
          const years = found.cluster.map(e => e.year);
          const minY = Math.min(...years);
          const maxY = Math.max(...years);
          const range = maxY - minY;
          const center = (minY + maxY) / 2;
          onViewportChange({
            centerYear: center,
            span: Math.max(range * 2, viewport.span / 4),
          });
        } else if (found?.event) {
          onSelectEvent(found.event);
        } else if (onSelectPeriod) {
          // Empty-canvas click: open the "period card" for the moment they clicked.
          const year = pixelToYear(mx, viewport, dims.w);
          onSelectPeriod(year);
        } else {
          onSelectEvent(null);
        }
      }
    },
    [onSelectEvent, onSelectPeriod, onViewportChange, viewport, dims.w]
  );

  // Touch handlers for mobile
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 1) {
        dragRef.current = { active: true, startX: e.touches[0].clientX, totalMoved: 0 };
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchRef.current = {
          active: true,
          dist0: Math.sqrt(dx * dx + dy * dy),
          span0: viewport.span,
        };
      }
    },
    [viewport.span]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      if (pinchRef.current.active && e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ratio = pinchRef.current.dist0 / dist;
        const newSpan = Math.max(0.5, Math.min(3e10, pinchRef.current.span0 * ratio));
        onViewportChange({ ...viewport, span: newSpan });
      } else if (dragRef.current.active && e.touches.length === 1) {
        const dx = e.touches[0].clientX - dragRef.current.startX;
        if (Math.abs(dx) > 1) {
          onViewportChange(pan(viewport, dx, dims.w));
          dragRef.current.startX = e.touches[0].clientX;
          dragRef.current.totalMoved += Math.abs(dx);
        }
      }
    },
    [viewport, dims.w, onViewportChange]
  );

  const onTouchEnd = useCallback(() => {
    dragRef.current.active = false;
    pinchRef.current.active = false;
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
      <canvas
        ref={canvasRef}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { dragRef.current.active = false; setHoveredId(null); }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ width: '100%', height: '100%', cursor: 'grab', touchAction: 'none' }}
      />
    </div>
  );
}
