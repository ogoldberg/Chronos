import { useEffect, useRef, useState } from 'react';
import type { Viewport, TimelineEvent } from '../types';
import { formatYear, scaleLabel } from '../utils/format';

interface Props {
  viewport: Viewport;
  visibleEvents: TimelineEvent[];
}

export default function InsightsPanel({ viewport, visibleEvents }: Props) {
  const [insights, setInsights] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const timerRef = useRef<number>(0);
  const lastFetchRef = useRef('');

  useEffect(() => {
    // Only fetch when zoomed past cosmic scale
    if (viewport.span > 1e9) {
      setInsights([]);
      return;
    }

    const key = `${Math.round(viewport.centerYear / (viewport.span * 0.1))}_${Math.round(viewport.span)}`;
    if (key === lastFetchRef.current) return;

    clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      lastFetchRef.current = key;
      setLoading(true);
      try {
        const resp = await fetch('/api/insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            centerYear: viewport.centerYear,
            span: viewport.span,
            visibleEvents: visibleEvents.slice(0, 10).map(e => e.title),
          }),
        });
        const data = await resp.json();
        if (data.insights?.length) setInsights(data.insights);
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }, 2500);

    return () => clearTimeout(timerRef.current);
  }, [viewport.centerYear, viewport.span, visibleEvents]);

  if (viewport.span > 1e9 && insights.length === 0) return null;

  return (
    <div style={{
      position: 'absolute',
      bottom: 20,
      left: 20,
      width: collapsed ? 44 : 340,
      background: 'rgba(13, 17, 23, 0.9)',
      borderRadius: 14,
      border: '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(20px)',
      zIndex: 30,
      overflow: 'hidden',
      transition: 'width 0.3s ease',
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          padding: collapsed ? '10px 12px' : '12px 16px',
          borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.06)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 16 }}>💡</span>
        {!collapsed && (
          <>
            <span style={{ color: '#ffffffbb', fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>
              AI INSIGHTS
            </span>
            <span style={{
              marginLeft: 'auto',
              fontSize: 10,
              color: '#ffffff50',
              fontFamily: 'monospace',
            }}>
              {scaleLabel(viewport.span)} · {formatYear(viewport.centerYear)}
            </span>
          </>
        )}
      </div>

      {/* Insights */}
      {!collapsed && (
        <div style={{ padding: '12px 16px' }}>
          {loading && insights.length === 0 && (
            <div style={{ color: '#ffffff50', fontSize: 12 }}>
              Discovering facts...
            </div>
          )}
          {insights.map((fact, i) => (
            <div
              key={i}
              style={{
                padding: '8px 0',
                borderBottom: i < insights.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                color: '#ffffffcc',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              <span style={{ color: '#ffd700', marginRight: 6 }}>✦</span>
              {fact}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
