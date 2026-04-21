import { useRef, useState } from 'react';
import type { Viewport, TimelineEvent } from '../../types';
import { formatYear, scaleLabel } from '../../utils/format';
import { callAI } from '../../ai/callAI';
import { INSIGHTS_SYSTEM } from '../../ai/prompts';

interface Props {
  viewport: Viewport;
  visibleEvents: TimelineEvent[];
}

interface InsightSource {
  url: string;
  title: string;
}

export default function InsightsPanel({ viewport, visibleEvents }: Props) {
  const [insights, setInsights] = useState<string[]>([]);
  const [sources, setSources] = useState<InsightSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState(false);
  const lastFetchRef = useRef('');

  // Hide at cosmic scale
  if (viewport.span > 1e9) return null;

  const fetchInsights = async () => {
    const key = `${Math.round(viewport.centerYear / (viewport.span * 0.1))}_${Math.round(viewport.span)}`;
    if (key === lastFetchRef.current && insights.length > 0) return;

    lastFetchRef.current = key;
    setLoading(true);
    try {
      const titles = visibleEvents.slice(0, 10).map(e => e.title).join(', ') || 'none';
      const userMsg = `Time period centered on year ${viewport.centerYear} (span: ${viewport.span} years). Visible events: ${titles}. Give me 3 fascinating facts about this era, and if any are concretely dateable historical events, include them in an "events" array alongside the facts.`;
      const { text, sources: aiSources } = await callAI(
        INSIGHTS_SYSTEM,
        [{ role: 'user', content: userMsg }],
        { maxTokens: 900, webSearch: true },
      );
      // Prompt returns {facts, events} — also accept a bare array as legacy shape.
      let facts: string[] = [];
      const objMatch = text.match(/\{[\s\S]*"facts"\s*:[\s\S]*\}/);
      const arrMatch = text.match(/\[[\s\S]*\]/);
      if (objMatch) {
        try {
          const parsed = JSON.parse(objMatch[0]);
          if (Array.isArray(parsed.facts)) facts = parsed.facts;
        } catch { /* try array form below */ }
      }
      if (facts.length === 0 && arrMatch) {
        try {
          const parsed = JSON.parse(arrMatch[0]);
          if (Array.isArray(parsed)) facts = parsed;
        } catch { /* give up */ }
      }
      const cleanFacts = facts
        .map(s => typeof s === 'string' ? stripCitationTags(s) : String(s))
        .filter(Boolean);
      if (cleanFacts.length > 0) setInsights(cleanFacts);
      setSources(aiSources ?? []);
    } catch {
      // Silently fail — AI errors (including missing-key) dispatch their own
      // UI via the gentle-gate overlay, so we don't need to surface here.
    } finally {
      setLoading(false);
    }
  };

  /** Strip Anthropic web_search <cite> markers that the AI sometimes emits. */
  function stripCitationTags(s: string): string {
    return s.replace(/<cite\s+index="[^"]*"\s*>/g, '').replace(/<\/cite>/g, '');
  }

  const handleActivate = () => {
    setActive(true);
    setCollapsed(false);
    fetchInsights();
  };

  const handleRefresh = () => {
    lastFetchRef.current = '';
    fetchInsights();
  };

  // Inactive state — just show a small button
  if (!active) {
    return (
      <div style={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        zIndex: 30,
      }}>
        <button
          onClick={handleActivate}
          style={{
            background: 'rgba(13, 17, 23, 0.9)',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(20px)',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            color: '#ffffffbb',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <span style={{ fontSize: 16 }}>{'💡'}</span>
          AI Insights
        </button>
      </div>
    );
  }

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
        style={{
          padding: collapsed ? '10px 12px' : '12px 16px',
          borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          onClick={() => setCollapsed(!collapsed)}
          style={{ fontSize: 16, cursor: 'pointer' }}
        >{'💡'}</span>
        {!collapsed && (
          <>
            <span
              onClick={() => setCollapsed(!collapsed)}
              style={{ color: '#ffffffbb', fontSize: 12, fontWeight: 600, letterSpacing: 0.5, cursor: 'pointer' }}
            >
              AI INSIGHTS
            </span>
            <span style={{
              marginLeft: 'auto',
              fontSize: 10,
              color: '#ffffff50',
              fontFamily: 'monospace',
            }}>
              {scaleLabel(viewport.span)} {'\u00b7'} {formatYear(viewport.centerYear)}
            </span>
            <button
              onClick={handleRefresh}
              title="Refresh insights for current view"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                padding: '3px 8px',
                color: '#ffffff80',
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              Refresh
            </button>
            <button
              onClick={() => { setActive(false); setInsights([]); setSources([]); }}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.4)',
                fontSize: 14,
                cursor: 'pointer',
                padding: '0 2px',
              }}
            >{'\u2715'}</button>
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
              <span style={{ color: '#ffd700', marginRight: 6 }}>{'\u2726'}</span>
              {fact}
            </div>
          ))}
          {sources.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ color: '#ffffff50', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Sources
              </div>
              {sources.map((s, i) => (
                <a
                  key={i}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    color: '#60a5fa',
                    fontSize: 11,
                    lineHeight: 1.4,
                    padding: '2px 0',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={s.url}
                >
                  {i + 1}. {s.title}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
