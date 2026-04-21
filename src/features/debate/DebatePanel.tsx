import { useState, useCallback } from 'react';
import { aiFetch } from '../../services/aiRequest';

interface Citation {
  source: string;
  title: string;
  url?: string;
}

interface Perspective {
  name: string;
  argument: string;
  citations: Citation[];
  timelineEvents?: Array<{ title: string; year: number }>;
}

interface DebateResult {
  perspectiveA: Perspective;
  perspectiveB: Perspective;
  synthesis: string;
}

interface Props {
  onClose: () => void;
  onNavigate: (year: number, span: number) => void;
}

const QUICK_SUGGESTIONS = [
  "Was Rome's fall inevitable?",
  'Was colonialism ever beneficial?',
  'Did the atomic bomb save lives?',
  'Was the French Revolution necessary?',
];

export default function DebatePanel({ onClose, onNavigate }: Props) {
  const [topic, setTopic] = useState('');
  const [result, setResult] = useState<DebateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSubmit = useCallback(async (question?: string) => {
    const q = (question || topic).trim();
    if (!q) return;

    setLoading(true);
    setError('');
    setResult(null);
    setHasSearched(true);

    try {
      const resp = await aiFetch('/api/debate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: q }),
      });

      if (resp.status === 429) {
        setError('Too many requests. Please wait a moment and try again.');
        setLoading(false);
        return;
      }

      if (!resp.ok) {
        setError('Failed to generate debate. Try again.');
        setLoading(false);
        return;
      }

      const data = await resp.json();
      if (data.perspectiveA && data.perspectiveB) {
        setResult(data);
      } else {
        setError('Could not generate debate perspectives. Try a different topic.');
      }
    } catch {
      setError('Connection error. Check your network and try again.');
    } finally {
      setLoading(false);
    }
  }, [topic]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const renderCitations = (citations: Citation[]) => (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 9, color: '#ffffff40', fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>SOURCES</div>
      {citations.map((c, i) => (
        <div key={i} style={{ fontSize: 10, color: '#ffffff60', lineHeight: 1.5 }}>
          {c.url ? (
            <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8', textDecoration: 'none' }}>
              {c.title}
            </a>
          ) : (
            <span>{c.title}</span>
          )}
          <span style={{ color: '#ffffff30' }}> ({c.source})</span>
        </div>
      ))}
    </div>
  );

  const renderTimelineLinks = (events?: Array<{ title: string; year: number }>) => {
    if (!events?.length) return null;
    return (
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {events.map((evt, i) => (
          <button
            key={i}
            onClick={() => onNavigate(evt.year, Math.max(50, Math.abs(evt.year) * 0.05))}
            style={{
              padding: '3px 8px',
              fontSize: 10,
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: 4,
              color: '#a5b4fc',
              cursor: 'pointer',
            }}
          >
            {evt.title} ({evt.year < 0 ? `${Math.abs(evt.year)} BCE` : evt.year})
          </button>
        ))}
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 80,
        right: 20,
        width: collapsed ? 44 : 560,
        maxHeight: collapsed ? 44 : 'calc(100vh - 120px)',
        background: 'rgba(13, 17, 23, 0.95)',
        borderRadius: 14,
        border: '1px solid rgba(99, 102, 241, 0.25)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(99, 102, 241, 0.06)',
        zIndex: 30,
        overflow: 'hidden',
        transition: 'width 0.3s ease',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          padding: collapsed ? '10px 12px' : '12px 16px',
          borderBottom: collapsed ? 'none' : '1px solid rgba(99, 102, 241, 0.15)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 16 }}>{'\u2696'}</span>
        {!collapsed && (
          <>
            <span style={{ color: '#818cf8', fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>
              DEBATE MODE
            </span>
            <span style={{
              marginLeft: 8,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 1,
              color: '#818cf8',
              background: 'rgba(99, 102, 241, 0.15)',
              padding: '2px 6px',
              borderRadius: 4,
              border: '1px solid rgba(99, 102, 241, 0.3)',
            }}>
              HISTORICAL DEBATE
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#ffffff40', cursor: 'pointer', fontSize: 14, padding: 2 }}
            >
              {'\u2715'}
            </button>
          </>
        )}
      </div>

      {!collapsed && (
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 16px 16px' }}>
          {/* Disclaimer */}
          <div style={{
            margin: '12px 0',
            padding: '8px 10px',
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            borderRadius: 8,
            fontSize: 10,
            color: '#a5b4fc',
            lineHeight: 1.5,
            textAlign: 'center',
          }}>
            These are interpretive positions generated for educational discussion, not definitive historical judgments.
          </div>

          {/* Input */}
          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Enter a historical debate topic..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 13,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: 10,
                color: '#ffffffdd',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              maxLength={300}
            />
            <button
              onClick={() => handleSubmit()}
              disabled={!topic.trim() || loading}
              style={{
                width: '100%',
                marginTop: 8,
                padding: '9px 0',
                fontSize: 13,
                fontWeight: 600,
                background: topic.trim() && !loading
                  ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(79, 70, 229, 0.2))'
                  : 'rgba(255,255,255,0.04)',
                border: topic.trim() && !loading
                  ? '1px solid rgba(99, 102, 241, 0.4)'
                  : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                color: topic.trim() && !loading ? '#c7d2fe' : '#ffffff30',
                cursor: topic.trim() && !loading ? 'pointer' : 'default',
                transition: 'all 0.2s',
              }}
            >
              {loading ? 'Generating perspectives...' : 'Start Debate'}
            </button>
          </div>

          {/* Quick suggestions */}
          {!hasSearched && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: '#ffffff50', fontWeight: 600, marginBottom: 6, letterSpacing: 0.3 }}>
                QUICK SUGGESTIONS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {QUICK_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setTopic(s); handleSubmit(s); }}
                    disabled={loading}
                    style={{
                      padding: '8px 12px',
                      fontSize: 12,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 8,
                      color: '#ffffffbb',
                      cursor: loading ? 'default' : 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                  >
                    {'\u2696'} {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#818cf8', fontSize: 13 }}>
              <div style={{ marginBottom: 8, fontSize: 24 }}>{'\u2696'}</div>
              Preparing both sides of the argument...
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 10 }}>{error}</div>
              <button
                onClick={() => handleSubmit()}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  padding: '6px 16px',
                  color: '#ffffffaa',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Results: Two columns */}
          {result && (
            <div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginBottom: 16,
              }}>
                {/* Perspective A - Blue */}
                <div style={{
                  padding: 14,
                  background: 'rgba(59, 130, 246, 0.06)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  borderRadius: 10,
                }}>
                  <div style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 1,
                    color: '#60a5fa',
                    background: 'rgba(59, 130, 246, 0.15)',
                    padding: '2px 6px',
                    borderRadius: 4,
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    display: 'inline-block',
                    marginBottom: 8,
                  }}>
                    PERSPECTIVE A
                  </div>
                  <div style={{ color: '#93c5fd', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                    {result.perspectiveA.name}
                  </div>
                  <div style={{ color: '#ffffffbb', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                    {result.perspectiveA.argument}
                  </div>
                  {result.perspectiveA.citations?.length > 0 && renderCitations(result.perspectiveA.citations)}
                  {renderTimelineLinks(result.perspectiveA.timelineEvents)}
                </div>

                {/* Perspective B - Amber */}
                <div style={{
                  padding: 14,
                  background: 'rgba(245, 158, 11, 0.06)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  borderRadius: 10,
                }}>
                  <div style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 1,
                    color: '#fbbf24',
                    background: 'rgba(245, 158, 11, 0.15)',
                    padding: '2px 6px',
                    borderRadius: 4,
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    display: 'inline-block',
                    marginBottom: 8,
                  }}>
                    PERSPECTIVE B
                  </div>
                  <div style={{ color: '#fde68a', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                    {result.perspectiveB.name}
                  </div>
                  <div style={{ color: '#ffffffbb', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                    {result.perspectiveB.argument}
                  </div>
                  {result.perspectiveB.citations?.length > 0 && renderCitations(result.perspectiveB.citations)}
                  {renderTimelineLinks(result.perspectiveB.timelineEvents)}
                </div>
              </div>

              {/* Synthesis - Green */}
              <div style={{
                padding: 14,
                background: 'rgba(34, 197, 94, 0.06)',
                border: '1px solid rgba(34, 197, 94, 0.25)',
                borderRadius: 10,
                marginBottom: 12,
              }}>
                <div style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: 1,
                  color: '#4ade80',
                  background: 'rgba(34, 197, 94, 0.15)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  display: 'inline-block',
                  marginBottom: 8,
                }}>
                  SYNTHESIS
                </div>
                <div style={{ color: '#ffffffcc', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                  {result.synthesis}
                </div>
              </div>

              {/* Bottom disclaimer */}
              <div style={{
                textAlign: 'center',
                padding: '10px 0',
                fontSize: 10,
                color: '#a5b4fc',
                borderTop: '1px solid rgba(99, 102, 241, 0.15)',
              }}>
                Both perspectives are AI-generated interpretive positions for educational discussion.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
