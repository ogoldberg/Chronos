/**
 * EventGraphModal — interactive force-directed graph visualization
 * centered on a single event, showing its Wikidata graph connections.
 *
 * Opens as a modal overlay. The focal event is pinned at center;
 * related events orbit around it with edges colored by relationship type.
 * Clicking a node navigates to that event on the timeline.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface RelatedEvent {
  title: string;
  year?: number;
  relation: string;
  description?: string;
  wiki?: string;
}

interface Props {
  eventTitle: string;
  eventYear: number;
  eventWiki: string;
  onNavigate: (year: number, span: number) => void;
  onClose: () => void;
}

// ── Graph types ──────────────────────────────────────────────────────

interface GNode {
  id: string;
  title: string;
  year?: number;
  relation: string; // 'self' for the focal event
  description?: string;
  wiki?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface GEdge {
  source: string;
  target: string;
  relation: string;
}

const RELATION_COLORS: Record<string, string> = {
  'Caused by':    '#f59e0b',
  'Led to':       '#22c55e',
  'Followed by':  '#22c55e',
  'Preceded by':  '#60a5fa',
  'Part of this': '#a78bfa',
  'Related event':'#60a5fa',
  self:           '#ffffff',
};

function getRelationColor(relation: string): string {
  return RELATION_COLORS[relation] || '#60a5fa';
}

// ── Component ────────────────────────────────────────────────────────

export default function EventGraphModal({ eventTitle, eventYear, eventWiki, onNavigate, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GNode[]>([]);
  const edgesRef = useRef<GEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [nodeCount, setNodeCount] = useState(0);

  // Camera
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, camX: 0, camY: 0 });

  // Fetch related events and build graph
  useEffect(() => {
    setLoading(true);
    fetch('/api/events/related', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wikiTitle: eventWiki }),
    })
      .then(r => r.json())
      .then(data => {
        const related: RelatedEvent[] = data.related || [];
        if (related.length === 0) {
          setError('No graph connections found for this event');
          setLoading(false);
          return;
        }

        // Build nodes: focal event at center + related events in a ring
        const nodes: GNode[] = [];
        const edges: GEdge[] = [];

        // Focal node pinned at center
        nodes.push({
          id: 'focal',
          title: eventTitle,
          year: eventYear,
          relation: 'self',
          wiki: eventWiki,
          x: 0, y: 0, vx: 0, vy: 0,
          radius: 22,
        });

        // Related nodes in a ring
        const seen = new Set<string>();
        related.forEach((rel, i) => {
          if (seen.has(rel.title)) return;
          seen.add(rel.title);

          const angle = (i / related.length) * Math.PI * 2 - Math.PI / 2;
          const dist = 160 + Math.random() * 80;
          nodes.push({
            id: `rel-${i}`,
            title: rel.title,
            year: rel.year,
            relation: rel.relation,
            description: rel.description,
            wiki: rel.wiki,
            x: Math.cos(angle) * dist,
            y: Math.sin(angle) * dist,
            vx: 0, vy: 0,
            radius: 12,
          });

          edges.push({
            source: 'focal',
            target: `rel-${i}`,
            relation: rel.relation,
          });
        });

        nodesRef.current = nodes;
        edgesRef.current = edges;
        setNodeCount(nodes.length);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load graph data');
        setLoading(false);
      });
  }, [eventTitle, eventYear, eventWiki]);

  // Coordinate transforms
  const screenToWorld = useCallback((sx: number, sy: number) => {
    const cam = cameraRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const w = canvas.width / window.devicePixelRatio;
    const h = canvas.height / window.devicePixelRatio;
    return {
      x: (sx - w / 2) / cam.zoom + cam.x,
      y: (sy - h / 2) / cam.zoom + cam.y,
    };
  }, []);

  const hitTest = useCallback((sx: number, sy: number): GNode | null => {
    const w = screenToWorld(sx, sy);
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i]!;
      const dx = n.x - w.x;
      const dy = n.y - w.y;
      if (dx * dx + dy * dy < n.radius * n.radius * 2) return n;
    }
    return null;
  }, [screenToWorld]);

  // Physics + render loop
  useEffect(() => {
    if (loading || nodeCount === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;
    let frame = 0;

    const resize = () => {
      const parent = containerRef.current;
      if (!parent) return;
      canvas.width = parent.clientWidth * window.devicePixelRatio;
      canvas.height = parent.clientHeight * window.devicePixelRatio;
      canvas.style.width = parent.clientWidth + 'px';
      canvas.style.height = parent.clientHeight + 'px';
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const tick = () => {
      if (!running) return;
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const cam = cameraRef.current;
      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;
      frame++;

      const damping = frame < 200 ? 0.88 : frame < 500 ? 0.95 : 0.98;

      // ── Forces ──
      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]!;
          const b = nodes[j]!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist2 = dx * dx + dy * dy + 1;
          const dist = Math.sqrt(dist2);
          const force = 3000 / dist2;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (a.id !== 'focal') { a.vx += fx; a.vy += fy; }
          if (b.id !== 'focal') { b.vx -= fx; b.vy -= fy; }
        }
      }

      // Spring attraction
      const nodeById = new Map(nodes.map(n => [n.id, n]));
      for (const e of edges) {
        const a = nodeById.get(e.source);
        const b = nodeById.get(e.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
        const force = 0.008 * (dist - 150);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (a.id !== 'focal') { a.vx += fx; a.vy += fy; }
        if (b.id !== 'focal') { b.vx -= fx; b.vy -= fy; }
      }

      // Apply velocity
      for (const n of nodes) {
        if (n.id === 'focal') continue; // Focal stays pinned
        n.vx *= damping;
        n.vy *= damping;
        n.x += n.vx;
        n.y += n.vy;
      }

      // ── Render ──
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(10, 14, 22, 0.98)';
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      // Edges
      for (const e of edges) {
        const a = nodeById.get(e.source);
        const b = nodeById.get(e.target);
        if (!a || !b) continue;

        const isHighlighted = hoveredNode === e.source || hoveredNode === e.target ||
                             selectedNode === e.source || selectedNode === e.target;
        const color = getRelationColor(e.relation);
        const alpha = isHighlighted ? 0.8 : hoveredNode || selectedNode ? 0.12 : 0.35;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = color + Math.round(alpha * 255).toString(16).padStart(2, '0');
        ctx.lineWidth = (isHighlighted ? 2.5 : 1) / cam.zoom;
        ctx.stroke();

        // Arrow head
        if (isHighlighted || (!hoveredNode && !selectedNode)) {
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          const arrowDist = b.radius + 4;
          const ax = b.x - Math.cos(angle) * arrowDist;
          const ay = b.y - Math.sin(angle) * arrowDist;
          const arrowSize = (isHighlighted ? 8 : 5) / cam.zoom;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - Math.cos(angle - 0.4) * arrowSize, ay - Math.sin(angle - 0.4) * arrowSize);
          ctx.lineTo(ax - Math.cos(angle + 0.4) * arrowSize, ay - Math.sin(angle + 0.4) * arrowSize);
          ctx.closePath();
          ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, '0');
          ctx.fill();
        }

        // Edge label with relation type + description
        if (isHighlighted) {
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;

          // Background pill for readability
          ctx.font = `600 ${10 / cam.zoom}px system-ui, sans-serif`;
          const labelText = e.relation;
          const metrics = ctx.measureText(labelText);
          const pillW = metrics.width + 12 / cam.zoom;
          const pillH = 18 / cam.zoom;
          ctx.fillStyle = 'rgba(10,14,22,0.9)';
          ctx.beginPath();
          ctx.roundRect(mx - pillW / 2, my - pillH - 4 / cam.zoom, pillW, pillH, 4 / cam.zoom);
          ctx.fill();

          ctx.fillStyle = color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(labelText, mx, my - pillH / 2 - 4 / cam.zoom);

          // Show target node description below the edge midpoint
          const targetNode = b.id === 'focal' ? a : b;
          if (targetNode.description) {
            ctx.font = `italic ${9 / cam.zoom}px system-ui, sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.textBaseline = 'top';
            const desc = targetNode.description.length > 50
              ? targetNode.description.slice(0, 48) + '...'
              : targetNode.description;
            ctx.fillText(desc, mx, my + 4 / cam.zoom);
          }
        }
      }

      // Nodes
      for (const n of nodes) {
        const isFocal = n.id === 'focal';
        const isHovered = n.id === hoveredNode;
        const isSelected = n.id === selectedNode;
        const isConnected = (hoveredNode || selectedNode) ?
          edges.some(e =>
            (e.source === (hoveredNode || selectedNode) && e.target === n.id) ||
            (e.target === (hoveredNode || selectedNode) && e.source === n.id)
          ) : false;

        const alpha = (hoveredNode || selectedNode)
          ? (isHovered || isSelected || isFocal || isConnected ? 1 : 0.15)
          : 1;

        const r = n.radius / cam.zoom;
        const color = isFocal ? '#ffcc70' : getRelationColor(n.relation);

        // Glow
        if (isFocal || isHovered || isSelected) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r * 2, 0, Math.PI * 2);
          const grd = ctx.createRadialGradient(n.x, n.y, r * 0.5, n.x, n.y, r * 2);
          grd.addColorStop(0, color + '30');
          grd.addColorStop(1, color + '00');
          ctx.fillStyle = grd;
          ctx.fill();
        }

        // Node disc
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, '0');
        ctx.fill();

        if (isHovered || isSelected || isFocal) {
          ctx.strokeStyle = '#ffffff60';
          ctx.lineWidth = 1.5 / cam.zoom;
          ctx.stroke();
        }

        // Label
        const showLabel = isFocal || isHovered || isSelected || isConnected || (!hoveredNode && !selectedNode);
        if (showLabel) {
          const fontSize = isFocal ? 13 : 11;
          ctx.font = `${isFocal ? '700' : '400'} ${fontSize / cam.zoom}px "Fraunces", Georgia, serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = `rgba(255,255,255,${alpha * (isFocal ? 1 : 0.85)})`;

          // Truncate long titles
          let label = n.title;
          if (label.length > 30) label = label.slice(0, 28) + '...';
          ctx.fillText(label, n.x, n.y + r + 4 / cam.zoom);

          // Year below title
          if (n.year) {
            ctx.font = `italic ${9 / cam.zoom}px "Fraunces", Georgia, serif`;
            ctx.fillStyle = `rgba(255,255,255,${alpha * 0.5})`;
            ctx.fillText(
              n.year < 0 ? `${Math.abs(Math.round(n.year))} BCE` : String(Math.round(n.year)),
              n.x, n.y + r + (4 + fontSize + 2) / cam.zoom,
            );
          }
        }
      }

      ctx.restore();

      // Title bar info
      ctx.fillStyle = '#ffffff90';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${nodes.length} events \u00b7 ${edges.length} connections`, 16, h - 12);

      animFrameRef.current = requestAnimationFrame(tick);
    };

    const animFrameRef = { current: requestAnimationFrame(tick) };

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [loading, nodeCount, hoveredNode, selectedNode]);

  // Mouse handlers
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (dragRef.current.active) {
      const cam = cameraRef.current;
      cam.x = dragRef.current.camX - (e.clientX - dragRef.current.startX) / cam.zoom;
      cam.y = dragRef.current.camY - (e.clientY - dragRef.current.startY) / cam.zoom;
      return;
    }

    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const node = hitTest(sx, sy);
    setHoveredNode(node?.id ?? null);
    if (canvasRef.current) {
      canvasRef.current.style.cursor = node ? 'pointer' : dragRef.current.active ? 'grabbing' : 'grab';
    }
  }, [hitTest]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const node = hitTest(sx, sy);

    if (node) {
      setSelectedNode(prev => prev === node.id ? null : node.id);
    } else {
      dragRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        camX: cameraRef.current.x,
        camY: cameraRef.current.y,
      };
    }
  }, [hitTest]);

  const handleMouseUp = useCallback(() => {
    dragRef.current.active = false;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const cam = cameraRef.current;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    cam.zoom = Math.max(0.3, Math.min(5, cam.zoom * factor));
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const node = hitTest(sx, sy);
    if (node && node.year) {
      onNavigate(Math.round(node.year), 5);
      onClose();
    }
  }, [hitTest, onNavigate, onClose]);

  // Selected node info panel
  const selectedInfo = selectedNode
    ? nodesRef.current.find(n => n.id === selectedNode)
    : null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#ffcc70', fontSize: 16, fontWeight: 700, fontFamily: '"Fraunces", Georgia, serif' }}>
            {eventTitle}
          </div>
          <div style={{ color: '#ffffff50', fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>
            Event Graph {'\u00b7'} Wikidata Knowledge Graph {'\u00b7'} Double-click a node to navigate
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#ffffff70' }}>
          {Object.entries(RELATION_COLORS).filter(([k]) => k !== 'self').map(([label, color]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
              {label}
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8,
            padding: '6px 14px',
            color: '#ffffff90',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#ffffff60', fontSize: 14,
          }}>
            Exploring Wikidata knowledge graph...
          </div>
        )}
        {error && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#ff6b6b', fontSize: 14,
          }}>
            {error}
          </div>
        )}
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
          style={{ width: '100%', height: '100%', cursor: 'grab' }}
        />

        {/* Selected node info */}
        {selectedInfo && selectedInfo.id !== 'focal' && (
          <div style={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            width: 280,
            background: 'rgba(10, 14, 22, 0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            padding: '14px 16px',
            backdropFilter: 'blur(20px)',
          }}>
            <div style={{ fontSize: 9, color: getRelationColor(selectedInfo.relation), fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {selectedInfo.relation}
            </div>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginTop: 4 }}>
              {selectedInfo.title}
            </div>
            {selectedInfo.year && (
              <div style={{ color: '#ffffff60', fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>
                {selectedInfo.year < 0 ? `${Math.abs(Math.round(selectedInfo.year))} BCE` : Math.round(selectedInfo.year)}
              </div>
            )}
            {selectedInfo.description && (
              <div style={{ color: '#ffffff80', fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>
                {selectedInfo.description.slice(0, 200)}
              </div>
            )}
            <button
              onClick={() => {
                if (selectedInfo.year) {
                  onNavigate(Math.round(selectedInfo.year), 5);
                  onClose();
                }
              }}
              style={{
                marginTop: 10,
                width: '100%',
                padding: '7px 12px',
                background: 'rgba(255,180,60,0.12)',
                border: '1px solid rgba(255,180,60,0.25)',
                borderRadius: 8,
                color: '#ffcc70',
                fontSize: 11,
                fontWeight: 600,
                cursor: selectedInfo.year ? 'pointer' : 'default',
                opacity: selectedInfo.year ? 1 : 0.4,
              }}
            >
              Navigate to this event
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
