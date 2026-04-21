import { useState, useCallback } from 'react';
import { aiFetch } from '../../services/aiRequest';

interface SpeculativeEvent {
  title: string;
  year: number;
  emoji: string;
  description: string;
  realEvent: string;
  realYear: number;
  divergence: string;
}

interface Props {
  onClose?: () => void;
  onNavigate?: (year: number, span: number) => void;
}

const QUICK_SUGGESTIONS = [
  'What if Rome never fell?',
  "What if the printing press wasn't invented?",
  'What if the Black Death never happened?',
  'What if the Library of Alexandria survived?',
];

export default function WhatIfPanel({ onClose, onNavigate }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpeculativeEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSubmit = useCallback(async (question?: string) => {
    const q = (question || query).trim();
    if (!q) return;

    setLoading(true);
    setError('');
    setResults([]);
    setHasSearched(true);

    try {
      const resp = await aiFetch('/api/whatif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });

      if (resp.status === 429) {
        setError('Too many requests. Please wait a moment and try again.');
        setLoading(false);
        return;
      }

      if (!resp.ok) {
        setError('Failed to generate alternate history. Try again.');
        setLoading(false);
        return;
      }

      const data = await resp.json();
      if (data.events?.length) {
        setResults(data.events);
      } else {
        setError('Could not generate speculative events. Try a different question.');
      }
    } catch {
      setError('Connection error. Check your network and try again.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 13,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: 10,
    color: '#ffffffdd',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 80,
        left: 20,
        width: collapsed ? 44 : 420,
        maxHeight: collapsed ? 44 : 'calc(100vh - 120px)',
        background: 'rgba(13, 17, 23, 0.95)',
        borderRadius: 14,
        border: '1px dashed rgba(245, 158, 11, 0.35)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(245, 158, 11, 0.06)',
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
          borderBottom: collapsed ? 'none' : '1px dashed rgba(245, 158, 11, 0.2)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 16 }}>{'\u{1F52E}'}</span>
        {!collapsed && (
          <>
            <span style={{ color: '#f59e0b', fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>
              WHAT IF...?
            </span>
            <span style={{
              marginLeft: 8,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 1,
              color: '#fbbf24',
              background: 'rgba(245, 158, 11, 0.15)',
              padding: '2px 6px',
              borderRadius: 4,
              border: '1px solid rgba(245, 158, 11, 0.3)',
            }}>
              SPECULATIVE FICTION
            </span>
            {onClose && (
              <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#ffffff40', cursor: 'pointer', fontSize: 14, padding: 2 }}
              >
                {'\u2715'}
              </button>
            )}
          </>
        )}
      </div>

      {!collapsed && (
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 16px 16px' }}>
          {/* Disclaimer */}
          <div style={{
            margin: '12px 0',
            padding: '8px 10px',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px dashed rgba(245, 158, 11, 0.25)',
            borderRadius: 8,
            fontSize: 10,
            color: '#fbbf24',
            lineHeight: 1.5,
            textAlign: 'center',
          }}>
            This is a creative thought experiment. All alternate history below is speculative fiction, not real history.
          </div>

          {/* Input */}
          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder="What if..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              style={inputStyle}
              maxLength={200}
            />
            <button
              onClick={() => handleSubmit()}
              disabled={!query.trim() || loading}
              style={{
                width: '100%',
                marginTop: 8,
                padding: '9px 0',
                fontSize: 13,
                fontWeight: 600,
                background: query.trim() && !loading
                  ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(217, 119, 6, 0.2))'
                  : 'rgba(255,255,255,0.04)',
                border: query.trim() && !loading
                  ? '1px solid rgba(245, 158, 11, 0.4)'
                  : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                color: query.trim() && !loading ? '#fde68a' : '#ffffff30',
                cursor: query.trim() && !loading ? 'pointer' : 'default',
                transition: 'all 0.2s',
              }}
            >
              {loading ? 'Imagining alternate history...' : 'Explore Alternate Timeline'}
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
                    onClick={() => { setQuery(s); handleSubmit(s); }}
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
                    {'\u{1F52E}'} {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#f59e0b', fontSize: 13 }}>
              <div style={{ marginBottom: 8, fontSize: 24 }}>{'\u{1F52E}'}</div>
              Rewriting history...
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

          {/* Results */}
          {results.length > 0 && (
            <div>
              <div style={{
                fontSize: 10,
                color: '#fbbf24',
                fontWeight: 700,
                marginBottom: 10,
                letterSpacing: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <span style={{
                  background: 'rgba(245, 158, 11, 0.2)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                }}>
                  FICTION
                </span>
                ALTERNATE TIMELINE
              </div>

              {results.map((evt, idx) => (
                <div
                  key={idx}
                  style={{
                    marginBottom: 12,
                    padding: 12,
                    background: 'rgba(245, 158, 11, 0.04)',
                    border: '1px dashed rgba(245, 158, 11, 0.2)',
                    borderRadius: 10,
                    position: 'relative',
                  }}
                >
                  {/* Fiction badge */}
                  <div style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: 1,
                    color: '#fbbf24',
                    background: 'rgba(245, 158, 11, 0.15)',
                    padding: '2px 5px',
                    borderRadius: 3,
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                  }}>
                    FICTION
                  </div>

                  {/* Speculative event */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 18 }}>{evt.emoji}</span>
                    <div>
                      <div style={{ color: '#fde68a', fontSize: 13, fontWeight: 600 }}>{evt.title}</div>
                      <div style={{ fontSize: 10, color: '#ffffff50', fontFamily: 'monospace' }}>
                        Speculative ~{evt.year < 0 ? `${Math.abs(evt.year)} BCE` : `${evt.year} CE`}
                      </div>
                    </div>
                  </div>

                  <p style={{ color: '#ffffffbb', fontSize: 12, lineHeight: 1.5, margin: '0 0 8px 0' }}>
                    {evt.description}
                  </p>

                  {/* Divergence explanation */}
                  <div style={{
                    padding: '8px 10px',
                    background: 'rgba(245, 158, 11, 0.06)',
                    border: '1px solid rgba(245, 158, 11, 0.12)',
                    borderRadius: 6,
                    marginBottom: 8,
                  }}>
                    <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600, marginBottom: 3 }}>
                      DIVERGES FROM REAL HISTORY
                    </div>
                    <div style={{ fontSize: 11, color: '#ffffffaa', lineHeight: 1.5 }}>
                      <strong style={{ color: '#ffffffcc' }}>{evt.realEvent}</strong>
                      {evt.realYear && (
                        <span style={{ color: '#ffffff50', fontFamily: 'monospace', marginLeft: 4 }}>
                          ({evt.realYear < 0 ? `${Math.abs(evt.realYear)} BCE` : `${evt.realYear} CE`})
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#ffffff80', lineHeight: 1.5, marginTop: 4 }}>
                      {evt.divergence}
                    </div>
                  </div>

                  {/* View real history button */}
                  {onNavigate && evt.realYear && (
                    <button
                      onClick={() => onNavigate(evt.realYear, Math.max(50, Math.abs(evt.realYear) * 0.05))}
                      style={{
                        padding: '5px 12px',
                        fontSize: 11,
                        background: 'rgba(99, 102, 241, 0.15)',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        borderRadius: 6,
                        color: '#a5b4fc',
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      View Real History {'\u2192'}
                    </button>
                  )}
                </div>
              ))}

              {/* Bottom disclaimer */}
              <div style={{
                textAlign: 'center',
                padding: '10px 0',
                fontSize: 10,
                color: '#fbbf24',
                borderTop: '1px dashed rgba(245, 158, 11, 0.15)',
                marginTop: 8,
              }}>
                All events above are speculative fiction for educational entertainment.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
