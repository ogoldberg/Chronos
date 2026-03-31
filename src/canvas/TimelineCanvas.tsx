import { useRef, useEffect, useCallback, useState } from 'react';
import type { TimelineEvent, Viewport } from '../types';
import { zoomAtCursor, pan } from './viewport';
import { renderTimeline, type HitTarget } from './renderer';

interface Props {
  viewport: Viewport;
  events: TimelineEvent[];
  selectedId: string | null;
  onViewportChange: (vp: Viewport) => void;
  onSelectEvent: (ev: TimelineEvent | null) => void;
  onHoverEvent: (ev: TimelineEvent | null) => void;
}

export default function TimelineCanvas({
  viewport,
  events,
  selectedId,
  onViewportChange,
  onSelectEvent,
  onHoverEvent,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 1200, h: 700 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hitTargetsRef = useRef<HitTarget[]>([]);
  const dragRef = useRef({ active: false, startX: 0 });
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
      selectedId
    );
  }, [viewport, events, dims, hoveredId, selectedId]);

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
    dragRef.current = { active: true, startX: e.clientX };
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
        }
      }
    },
    [viewport, dims.w, onViewportChange, onHoverEvent]
  );

  const onMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!dragRef.current.active) return;
      const moved = Math.abs(e.clientX - dragRef.current.startX);
      dragRef.current.active = false;

      // If barely moved, treat as click
      if (moved < 5) {
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
        onSelectEvent(found);
      }
    },
    [onSelectEvent]
  );

  // Touch handlers for mobile
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 1) {
        dragRef.current = { active: true, startX: e.touches[0].clientX };
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
