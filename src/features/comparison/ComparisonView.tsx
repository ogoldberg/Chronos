import { useState, useEffect, useRef, useCallback } from 'react';
import type { Viewport, TimelineEvent } from '../../types';
import { formatYear, formatYearShort } from '../../utils/format';
import { yearToPixel, isEventVisible } from '../../canvas/viewport';
import { REGION_LANES, matchEventToRegion } from '../../data/regions';
import { speak, stopSpeech, isSpeaking } from '../../utils/speech';

interface Props {
  viewport: Viewport;
  events: TimelineEvent[];
  onClose: () => void;
  onSelectEvent: (ev: TimelineEvent) => void;
}

export default function ComparisonView({ viewport, events, onClose, onSelectEvent }: Props) {
  const [selectedRegions, setSelectedRegions] = useState<string[]>(['europe', 'eastasia']);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 400 });

  // Narration state
  const [narration, setNarration] = useState('');
  const [narrationLoading, setNarrationLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const narrationRequestRef = useRef(0);

  const fetchNarration = useCallback(async () => {
    if (selectedRegions.length === 0) return;
    const requestId = ++narrationRequestRef.current;
    setNarrationLoading(true);
    stopSpeech();
    setSpeaking(false);

    const startYear = Math.round(viewport.centerYear - viewport.span / 2);
    const endYear = Math.round(viewport.centerYear + viewport.span / 2);
    const visibleEvents = events
      .filter(ev => ev.year >= startYear && ev.year <= endYear)
      .map(ev => ev.title)
      .slice(0, 20);

    try {
      const res = await fetch('/api/comparison-narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regions: selectedRegions,
          startYear,
          endYear,
          events: visibleEvents,
        }),
      });
      if (requestId !== narrationRequestRef.current) return;
      if (!res.ok) { setNarration(''); setNarrationLoading(false); return; }
      const data = await res.json();
      const text = data.narration || '';
      setNarration(text);
      if (voiceEnabled && text) {
        setSpeaking(true);
        speak(text, () => setSpeaking(false));
      }
    } catch {
      if (requestId === narrationRequestRef.current) setNarration('');
    } finally {
      if (requestId === narrationRequestRef.current) setNarrationLoading(false);
    }
  }, [selectedRegions, viewport.centerYear, viewport.span, events, voiceEnabled]);

  // Auto-update narration when viewport or regions change (debounced)
  useEffect(() => {
    if (!narration && !narrationLoading) return; // only auto-update if narration was previously requested
    const timer = setTimeout(() => { fetchNarration(); }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.centerYear, viewport.span, selectedRegions]);

  const toggleVoice = () => {
    if (speaking) { stopSpeech(); setSpeaking(false); }
    setVoiceEnabled(v => !v);
  };

  // Resize
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

  // Render
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

    const W = dims.w;
    const H = dims.h;
    const left = viewport.centerYear - viewport.span / 2;
    const right = viewport.centerYear + viewport.span / 2;

    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, W, H);

    const laneCount = selectedRegions.length;
    if (laneCount === 0) return;
    const laneH = (H - 40) / laneCount;
    const HEADER_W = 100;

    // Draw lanes
    selectedRegions.forEach((regionId, i) => {
      const lane = REGION_LANES.find(l => l.id === regionId);
      if (!lane) return;
      const y = 30 + i * laneH;

      // Lane background
      ctx.fillStyle = lane.color + '08';
      ctx.fillRect(HEADER_W, y, W - HEADER_W, laneH);

      // Lane border
      ctx.strokeStyle = lane.color + '30';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(HEADER_W, y + laneH);
      ctx.lineTo(W, y + laneH);
      ctx.stroke();

      // Lane label
      ctx.fillStyle = lane.color + 'cc';
      ctx.font = 'bold 11px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${lane.emoji} ${lane.label}`, 8, y + laneH / 2);

      // Timeline axis
      const axisY = y + laneH / 2;
      ctx.strokeStyle = lane.color + '20';
      ctx.beginPath();
      ctx.moveTo(HEADER_W, axisY);
      ctx.lineTo(W, axisY);
      ctx.stroke();

      // Events in this region
      const regionEvents = events.filter(ev =>
        isEventVisible(ev, viewport) && matchEventToRegion(ev.lat, ev.lng) === regionId
      );

      let prevX = -100;
      for (const ev of regionEvents.slice(0, 30)) {
        const x = HEADER_W + ((ev.year - left) / (right - left)) * (W - HEADER_W);
        if (x < HEADER_W || x > W) continue;

        // Skip if too close to previous
        if (Math.abs(x - prevX) < 40) continue;
        prevX = x;

        // Dot
        ctx.beginPath();
        ctx.arc(x, axisY, 4, 0, Math.PI * 2);
        ctx.fillStyle = ev.color;
        ctx.fill();

        // Label above/below alternating
        const labelY = axisY + (regionEvents.indexOf(ev) % 2 === 0 ? -15 : 15);
        ctx.font = '9px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = regionEvents.indexOf(ev) % 2 === 0 ? 'bottom' : 'top';
        ctx.fillStyle = '#ffffffbb';
        ctx.fillText(ev.title.slice(0, 20), x, labelY);

        // Year
        ctx.font = '8px monospace';
        ctx.fillStyle = ev.color + '80';
        ctx.fillText(formatYearShort(ev.year), x, labelY + (regionEvents.indexOf(ev) % 2 === 0 ? -10 : 10));
      }
    });

    // Shared time axis at top
    ctx.fillStyle = '#ffffff30';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const steps = Math.max(3, Math.min(10, Math.floor(W / 100)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = HEADER_W + t * (W - HEADER_W);
      const year = left + t * (right - left);
      ctx.fillText(formatYearShort(year), x, 10);
      ctx.strokeStyle = '#ffffff10';
      ctx.beginPath();
      ctx.moveTo(x, 25);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
  }, [viewport, events, selectedRegions, dims]);

  const toggleRegion = (id: string) => {
    setSelectedRegions(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'rgba(10, 10, 26, 0.95)',
      zIndex: 80,
      display: 'flex',
      flexDirection: 'column',
      backdropFilter: 'blur(10px)',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{ fontSize: 16 }}>⚖️</span>
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>COMPARISON VIEW</span>
        <span style={{ color: '#ffffff40', fontSize: 11, fontFamily: 'monospace' }}>
          {formatYear(viewport.centerYear - viewport.span / 2)} → {formatYear(viewport.centerYear + viewport.span / 2)}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {REGION_LANES.map(lane => (
            <button
              key={lane.id}
              onClick={() => toggleRegion(lane.id)}
              style={{
                background: selectedRegions.includes(lane.id) ? `${lane.color}20` : 'transparent',
                border: `1px solid ${selectedRegions.includes(lane.id) ? lane.color + '60' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 6,
                padding: '3px 8px',
                color: selectedRegions.includes(lane.id) ? lane.color : '#ffffff40',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {lane.emoji} {lane.label}
            </button>
          ))}
        </div>

        <button
          onClick={fetchNarration}
          disabled={narrationLoading || selectedRegions.length === 0}
          style={{
            background: narrationLoading ? 'rgba(255,255,255,0.05)' : 'rgba(100,149,237,0.15)',
            border: '1px solid rgba(100,149,237,0.3)',
            borderRadius: 6,
            padding: '3px 10px',
            color: narrationLoading ? '#ffffff40' : '#6495ed',
            fontSize: 11,
            cursor: narrationLoading ? 'wait' : 'pointer',
            fontWeight: 600,
          }}
        >
          {narrationLoading ? 'Narrating...' : 'Narrate'}
        </button>

        <button
          onClick={toggleVoice}
          title={voiceEnabled ? 'Disable voice narration' : 'Enable voice narration'}
          style={{
            background: voiceEnabled ? 'rgba(34,197,94,0.15)' : 'transparent',
            border: `1px solid ${voiceEnabled ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 6,
            padding: '3px 8px',
            color: voiceEnabled ? '#22c55e' : '#ffffff40',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {speaking ? '🔊' : '🔈'}
        </button>

        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#ffffff60',
            fontSize: 18,
            cursor: 'pointer',
            padding: '0 4px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Narration panel */}
      {narration && (
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          maxHeight: 160,
          overflowY: 'auto',
          background: 'rgba(10, 10, 26, 0.6)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12 }}>🎙️</span>
            <span style={{ color: '#ffffffaa', fontSize: 11, fontWeight: 600, letterSpacing: 0.3 }}>
              AI NARRATION
            </span>
          </div>
          <p style={{
            color: '#ffffffcc',
            fontSize: 12,
            lineHeight: 1.7,
            margin: 0,
            whiteSpace: 'pre-wrap',
            fontFamily: 'Georgia, serif',
          }}>
            {narration}
          </p>
        </div>
      )}
    </div>
  );
}
