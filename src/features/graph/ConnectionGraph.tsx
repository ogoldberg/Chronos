import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { TimelineEvent, EventConnection } from '../../types';

interface Props {
  onNavigate: (year: number, span: number) => void;
  onClose: () => void;
  events: TimelineEvent[];
}

/* ── Types ─────────────────────────────────────────────────────────── */

interface GraphNode {
  id: string;
  title: string;
  emoji: string;
  year: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  connections: number;
  color: string;
}

interface GraphEdge {
  source: string;
  target: string;
  type: EventConnection['type'];
  label?: string;
}

type FilterType = 'caused' | 'influenced' | 'related';

const EDGE_COLORS: Record<string, string> = {
  caused: '#dc143c',
  led_to: '#dc143c',
  response_to: '#dc143c',
  influenced: '#daa520',
  preceded: '#daa520',
  related: '#4169e1',
};

function edgeFilterGroup(type: string): FilterType {
  if (type === 'caused' || type === 'led_to' || type === 'response_to') return 'caused';
  if (type === 'influenced' || type === 'preceded') return 'influenced';
  return 'related';
}

/* ── Build graph from events ───────────────────────────────────────── */

function buildGraph(events: TimelineEvent[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodeMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  // Only include events that have connections
  const eventsWithConns = events.filter((e) => e.connections && e.connections.length > 0);

  // Also collect targets referenced in connections so we can include them
  const allReferencedTitles = new Set<string>();
  for (const e of eventsWithConns) {
    allReferencedTitles.add(e.title);
    for (const c of e.connections || []) {
      if (c.targetTitle) allReferencedTitles.add(c.targetTitle);
    }
  }

  // Index events by title for connection resolution
  const eventByTitle = new Map<string, TimelineEvent>();
  for (const e of events) {
    eventByTitle.set(e.title, e);
  }

  // Create nodes for all events that participate in connections
  const relevantEvents = events.filter((e) => allReferencedTitles.has(e.title));

  for (const e of relevantEvents) {
    if (!nodeMap.has(e.id)) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 100 + Math.random() * 300;
      nodeMap.set(e.id, {
        id: e.id,
        title: e.title,
        emoji: e.emoji,
        year: e.year,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        connections: 0,
        color: e.color,
      });
    }
  }

  // Build edges
  for (const e of eventsWithConns) {
    for (const c of e.connections || []) {
      // Find target by id or title
      let targetEvent: TimelineEvent | undefined;
      if (c.targetId) {
        targetEvent = events.find((ev) => ev.id === c.targetId);
      }
      if (!targetEvent && c.targetTitle) {
        targetEvent = eventByTitle.get(c.targetTitle);
      }
      if (!targetEvent) continue;

      const sourceNode = nodeMap.get(e.id);
      const targetNode = nodeMap.get(targetEvent.id);
      if (!sourceNode || !targetNode) continue;

      edges.push({
        source: e.id,
        target: targetEvent.id,
        type: c.type,
        label: c.label,
      });
      sourceNode.connections++;
      targetNode.connections++;
    }
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}

/* ── Component ─────────────────────────────────────────────────────── */

function ConnectionGraph({ onNavigate, onClose, events }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const animFrameRef = useRef<number>(0);

  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [filters, setFilters] = useState<Set<FilterType>>(new Set(['caused', 'influenced', 'related']));
  const [searchQuery, setSearchQuery] = useState('');
  const [expandLoading, setExpandLoading] = useState(false);

  // Camera state
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; camX: number; camY: number }>({
    active: false, startX: 0, startY: 0, camX: 0, camY: 0,
  });

  // Initialize graph
  const initialGraph = useMemo(() => buildGraph(events), [events]);

  useEffect(() => {
    nodesRef.current = initialGraph.nodes.map((n) => ({ ...n }));
    edgesRef.current = [...initialGraph.edges];
  }, [initialGraph]);

  // Toggle filter
  const toggleFilter = (f: FilterType) => {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  };

  // Screen <-> world coordinate transforms
  const screenToWorld = useCallback((sx: number, sy: number) => {
    const cam = cameraRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    return {
      x: (sx - canvas.width / 2) / cam.zoom + cam.x,
      y: (sy - canvas.height / 2) / cam.zoom + cam.y,
    };
  }, []);

  const worldToScreen = useCallback((wx: number, wy: number) => {
    const cam = cameraRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    return {
      x: (wx - cam.x) * cam.zoom + canvas.width / 2,
      y: (wy - cam.y) * cam.zoom + canvas.height / 2,
    };
  }, []);

  // Find node under cursor
  const hitTest = useCallback((sx: number, sy: number): GraphNode | null => {
    const w = screenToWorld(sx, sy);
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      const r = 10 + Math.min(n.connections * 3, 20);
      const dx = n.x - w.x;
      const dy = n.y - w.y;
      if (dx * dx + dy * dy < r * r) return n;
    }
    return null;
  }, [screenToWorld]);

  // Physics simulation + render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;
    let damping = 0.92;
    let frameCount = 0;

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

      frameCount++;
      // Gradually increase damping to settle
      if (frameCount < 300) damping = 0.92;
      else if (frameCount < 600) damping = 0.96;
      else damping = 0.98;

      // ── Forces ──
      const REPULSION = 5000;
      const SPRING_K = 0.005;
      const SPRING_LEN = 120;

      // Repulsion between all nodes (Coulomb's law)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          const dist2 = dx * dx + dy * dy + 1;
          const dist = Math.sqrt(dist2);
          const force = REPULSION / dist2;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
      }

      // Spring attraction along edges
      const nodeById = new Map<string, GraphNode>();
      for (const n of nodes) nodeById.set(n.id, n);

      for (const e of edges) {
        const a = nodeById.get(e.source);
        const b = nodeById.get(e.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
        const displacement = dist - SPRING_LEN;
        const force = SPRING_K * displacement;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }

      // Apply velocity + damping
      for (const n of nodes) {
        n.vx *= damping;
        n.vy *= damping;
        n.x += n.vx;
        n.y += n.vy;
      }

      // ── Render ──
      ctx.clearRect(0, 0, w, h);

      // Background
      ctx.fillStyle = '#0a0e14';
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      // Edges
      for (const e of edges) {
        const filterGroup = edgeFilterGroup(e.type);
        if (!filters.has(filterGroup)) continue;

        const a = nodeById.get(e.source);
        const b = nodeById.get(e.target);
        if (!a || !b) continue;

        const isHighlighted = selectedNode === e.source || selectedNode === e.target;
        const alpha = isHighlighted ? 0.7 : selectedNode ? 0.08 : 0.25;
        const lineWidth = isHighlighted ? 2 : 1;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        const color = EDGE_COLORS[e.type] || '#4169e1';
        ctx.strokeStyle = color + Math.round(alpha * 255).toString(16).padStart(2, '0');
        ctx.lineWidth = lineWidth / cam.zoom;
        ctx.stroke();

        // Label on highlighted edges
        if (isHighlighted && e.label) {
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.font = `${10 / cam.zoom}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(e.label, mx, my - 4 / cam.zoom);
        }
      }

      // Nodes
      for (const n of nodes) {
        const r = (10 + Math.min(n.connections * 3, 20)) / cam.zoom;
        const isSelected = n.id === selectedNode;
        const isConnected = selectedNode
          ? edges.some(
              (e) =>
                (e.source === selectedNode && e.target === n.id) ||
                (e.target === selectedNode && e.source === n.id),
            )
          : false;

        const alpha = selectedNode
          ? isSelected ? 1 : isConnected ? 0.85 : 0.15
          : 0.85;

        // Glow
        if (isSelected || (!selectedNode && n.connections > 2)) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r * 1.8, 0, Math.PI * 2);
          const glow = ctx.createRadialGradient(n.x, n.y, r * 0.5, n.x, n.y, r * 1.8);
          glow.addColorStop(0, n.color + '40');
          glow.addColorStop(1, n.color + '00');
          ctx.fillStyle = glow;
          ctx.fill();
        }

        // Circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.color + Math.round(alpha * 255).toString(16).padStart(2, '0');
        ctx.fill();

        if (isSelected) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2 / cam.zoom;
          ctx.stroke();
        }

        // Emoji
        ctx.font = `${Math.max(12, r * 1.1)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = alpha;
        ctx.fillText(n.emoji, n.x, n.y);
        ctx.globalAlpha = 1;

        // Title
        if (cam.zoom > 0.5 || isSelected || isConnected) {
          ctx.fillStyle = `rgba(255,255,255,${alpha * 0.8})`;
          ctx.font = `${11 / cam.zoom}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(n.title, n.x, n.y + r + 12 / cam.zoom);
        }
      }

      ctx.restore();

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [selectedNode, filters]);

  // Mouse interactions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = cameraRef.current;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      cam.zoom = Math.max(0.1, Math.min(5, cam.zoom * factor));
    };

    const onMouseDown = (e: MouseEvent) => {
      const node = hitTest(e.offsetX * window.devicePixelRatio, e.offsetY * window.devicePixelRatio);
      if (node) {
        setSelectedNode(node.id);
      } else {
        dragRef.current = {
          active: true,
          startX: e.clientX,
          startY: e.clientY,
          camX: cameraRef.current.x,
          camY: cameraRef.current.y,
        };
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      const cam = cameraRef.current;
      cam.x = dragRef.current.camX - (e.clientX - dragRef.current.startX) / cam.zoom;
      cam.y = dragRef.current.camY - (e.clientY - dragRef.current.startY) / cam.zoom;
    };

    const onMouseUp = () => {
      dragRef.current.active = false;
    };

    const onDblClick = (e: MouseEvent) => {
      const node = hitTest(e.offsetX * window.devicePixelRatio, e.offsetY * window.devicePixelRatio);
      if (node) {
        const span = Math.abs(node.year) > 1000 ? 200 : 100;
        onNavigate(node.year, span);
      }
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('dblclick', onDblClick);

    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('dblclick', onDblClick);
    };
  }, [hitTest, onNavigate]);

  // Search: center on matching node
  const handleSearch = () => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;
    const node = nodesRef.current.find((n) => n.title.toLowerCase().includes(q));
    if (node) {
      cameraRef.current.x = node.x;
      cameraRef.current.y = node.y;
      setSelectedNode(node.id);
    }
  };

  // Expand: load connections for selected node from AI
  const handleExpand = async () => {
    if (!selectedNode) return;
    const node = nodesRef.current.find((n) => n.id === selectedNode);
    if (!node) return;
    setExpandLoading(true);
    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `List 3-5 historical events directly connected to "${node.title}" (${node.year}). For each, state the connection type (caused, influenced, or related) and a brief description. Return as JSON array: [{"title":"...","year":1234,"emoji":"...","type":"caused|influenced|related","label":"short label","description":"..."}]`,
          }],
        }),
      });
      if (!resp.ok) throw new Error('Failed to expand');
      const data = await resp.json();
      const text = data.content || '';
      const jsonMatch = text.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        const newEvents: any[] = JSON.parse(jsonMatch[0]);
        const existingTitles = new Set(nodesRef.current.map((n) => n.title));

        for (const ne of newEvents) {
          if (existingTitles.has(ne.title)) {
            // Just add edge if node exists
            const existing = nodesRef.current.find((n) => n.title === ne.title);
            if (existing) {
              const edgeExists = edgesRef.current.some(
                (e) =>
                  (e.source === selectedNode && e.target === existing.id) ||
                  (e.target === selectedNode && e.source === existing.id),
              );
              if (!edgeExists) {
                edgesRef.current.push({
                  source: selectedNode,
                  target: existing.id,
                  type: ne.type || 'related',
                  label: ne.label,
                });
                existing.connections++;
                node.connections++;
              }
            }
            continue;
          }

          // Add new node near the selected node
          const angle = Math.random() * Math.PI * 2;
          const newNode: GraphNode = {
            id: `expanded-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            title: ne.title,
            emoji: ne.emoji || '\uD83D\uDD35',
            year: ne.year,
            x: node.x + Math.cos(angle) * 120,
            y: node.y + Math.sin(angle) * 120,
            vx: 0,
            vy: 0,
            connections: 1,
            color: EDGE_COLORS[ne.type] || '#4169e1',
          };
          nodesRef.current.push(newNode);
          node.connections++;
          edgesRef.current.push({
            source: selectedNode,
            target: newNode.id,
            type: ne.type || 'related',
            label: ne.label,
          });
        }
      }
    } catch {
      // Silently fail — could show toast
    } finally {
      setExpandLoading(false);
    }
  };

  // Selected node info
  const selectedInfo = selectedNode
    ? nodesRef.current.find((n) => n.id === selectedNode) || initialGraph.nodes.find((n) => n.id === selectedNode)
    : null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: '#0a0e14',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          background: 'rgba(10,14,20,0.95)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          zIndex: 2,
        }}
      >
        <span style={{ fontSize: 20 }}>{'\uD83D\uDD78\uFE0F'}</span>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Connection Graph</div>

        {/* Search */}
        <div style={{ marginLeft: 20, display: 'flex', gap: 6 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="Search events..."
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '5px 10px',
              color: '#fff',
              fontSize: 12,
              outline: 'none',
              width: 180,
            }}
          />
          <button
            onClick={handleSearch}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '5px 10px',
              color: '#fff',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Find
          </button>
        </div>

        {/* Filters */}
        <div style={{ marginLeft: 20, display: 'flex', gap: 6 }}>
          {([
            { key: 'caused' as FilterType, label: 'Caused', color: '#dc143c' },
            { key: 'influenced' as FilterType, label: 'Influenced', color: '#daa520' },
            { key: 'related' as FilterType, label: 'Related', color: '#4169e1' },
          ]).map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => toggleFilter(key)}
              style={{
                background: filters.has(key) ? color + '30' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${filters.has(key) ? color + '60' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 8,
                padding: '4px 10px',
                color: filters.has(key) ? color : 'rgba(255,255,255,0.4)',
                fontSize: 11,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Expand button */}
        {selectedNode && (
          <button
            onClick={handleExpand}
            disabled={expandLoading}
            style={{
              marginLeft: 10,
              background: 'rgba(59,130,246,0.2)',
              border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: 8,
              padding: '5px 12px',
              color: '#7eb8ff',
              fontSize: 12,
              cursor: expandLoading ? 'not-allowed' : 'pointer',
              fontWeight: 600,
            }}
          >
            {expandLoading ? 'Expanding...' : 'Expand Connections'}
          </button>
        )}

        <button
          onClick={onClose}
          style={{
            marginLeft: 'auto',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            padding: '5px 14px',
            color: '#fff',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {'\u2715'} Close
        </button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{ flex: 1, cursor: dragRef.current.active ? 'grabbing' : 'grab' }}
      />

      {/* Selected node info */}
      {selectedInfo && (
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            background: 'rgba(10,14,20,0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            padding: '14px 18px',
            maxWidth: 320,
            zIndex: 3,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 22 }}>{selectedInfo.emoji}</span>
            <div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{selectedInfo.title}</div>
              <div style={{ color: '#ffffff60', fontSize: 11, fontFamily: 'monospace' }}>
                {selectedInfo.year < 0
                  ? `${Math.abs(selectedInfo.year).toLocaleString()} BCE`
                  : `${selectedInfo.year} CE`}
                {' \u2022 '}
                {selectedInfo.connections} connection{selectedInfo.connections !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
          <div style={{ color: '#ffffff50', fontSize: 11, marginTop: 4 }}>
            Double-click to view on timeline
          </div>
        </div>
      )}

      {/* Empty state */}
      {initialGraph.nodes.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3,
            pointerEvents: 'none',
          }}
        >
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', maxWidth: 400 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{'\uD83D\uDD78\uFE0F'}</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No Connections Yet</div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              Explore the timeline and use the AI chat to discover events with connections.
              Events with cause/effect relationships will appear here.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConnectionGraph;
