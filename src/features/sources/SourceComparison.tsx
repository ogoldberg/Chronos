import { useState, useCallback } from 'react';
import { aiFetch } from '../../services/aiRequest';

interface Perspective {
  tradition: string;
  narrative: string;
  keyDifferences: string[];
}

interface ComparisonResult {
  perspectives: Perspective[];
  consensus: string;
}

interface Props {
  onClose: () => void;
  onNavigate: (year: number, span: number) => void;
}

const QUICK_SUGGESTIONS = [
  'The Mongol Empire',
  'The Crusades',
  'The Columbian Exchange',
  'The Opium Wars',
];

const PERSPECTIVE_COLORS = [
  { bg: 'rgba(59, 130, 246, 0.06)', border: 'rgba(59, 130, 246, 0.25)', text: '#93c5fd', label: '#60a5fa', labelBg: 'rgba(59, 130, 246, 0.15)', labelBorder: 'rgba(59, 130, 246, 0.3)', diff: 'rgba(59, 130, 246, 0.08)' },
  { bg: 'rgba(245, 158, 11, 0.06)', border: 'rgba(245, 158, 11, 0.25)', text: '#fde68a', label: '#fbbf24', labelBg: 'rgba(245, 158, 11, 0.15)', labelBorder: 'rgba(245, 158, 11, 0.3)', diff: 'rgba(245, 158, 11, 0.08)' },
  { bg: 'rgba(168, 85, 247, 0.06)', border: 'rgba(168, 85, 247, 0.25)', text: '#d8b4fe', label: '#a78bfa', labelBg: 'rgba(168, 85, 247, 0.15)', labelBorder: 'rgba(168, 85, 247, 0.3)', diff: 'rgba(168, 85, 247, 0.08)' },
];

export default function SourceComparison({ onClose, onNavigate }: Props) {
  const [topic, setTopic] = useState('');
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Suppress unused var warning — onNavigate is part of the public API for future use
  void onNavigate;

  const handleSubmit = useCallback(async (question?: string) => {
    const q = (question || topic).trim();
    if (!q) return;

    setLoading(true);
    setError('');
    setResult(null);
    setHasSearched(true);

    try {
      const resp = await aiFetch('/api/sources/compare', {
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
        setError('Failed to generate comparison. Try again.');
        setLoading(false);
        return;
      }

      const data = await resp.json();
      if (data.perspectives?.length) {
        setResult(data);
      } else {
        setError('Could not generate perspectives. Try a different topic.');
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

  return (
    <div
      style={{
        position: 'absolute',
        top: 80,
        right: 20,
        width: collapsed ? 44 : 620,
        maxHeight: collapsed ? 44 : 'calc(100vh - 120px)',
        background: 'rgba(13, 17, 23, 0.95)',
        borderRadius: 14,
        border: '1px solid rgba(168, 85, 247, 0.25)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(168, 85, 247, 0.06)',
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
          borderBottom: collapsed ? 'none' : '1px solid rgba(168, 85, 247, 0.15)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 16 }}>{'\u{1F50D}'}</span>
        {!collapsed && (
          <>
            <span style={{ color: '#a78bfa', fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>
              SOURCE COMPARISON
            </span>
            <span style={{
              marginLeft: 8,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 1,
              color: '#c4b5fd',
              background: 'rgba(168, 85, 247, 0.15)',
              padding: '2px 6px',
              borderRadius: 4,
              border: '1px solid rgba(168, 85, 247, 0.3)',
            }}>
              HISTORIOGRAPHY
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
            background: 'rgba(168, 85, 247, 0.08)',
            border: '1px solid rgba(168, 85, 247, 0.2)',
            borderRadius: 8,
            fontSize: 10,
            color: '#c4b5fd',
            lineHeight: 1.5,
            textAlign: 'center',
          }}>
            These represent historiographic traditions, not individual opinions.
          </div>

          {/* Input */}
          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Enter a historical event or topic..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 13,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
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
                  ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(139, 92, 246, 0.2))'
                  : 'rgba(255,255,255,0.04)',
                border: topic.trim() && !loading
                  ? '1px solid rgba(168, 85, 247, 0.4)'
                  : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                color: topic.trim() && !loading ? '#d8b4fe' : '#ffffff30',
                cursor: topic.trim() && !loading ? 'pointer' : 'default',
                transition: 'all 0.2s',
              }}
            >
              {loading ? 'Analyzing perspectives...' : 'Compare Sources'}
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
                    {'\u{1F50D}'} {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#a78bfa', fontSize: 13 }}>
              <div style={{ marginBottom: 8, fontSize: 24 }}>{'\u{1F50D}'}</div>
              Gathering historical perspectives...
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

          {/* Results: Perspective columns */}
          {result && (
            <div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: result.perspectives.length === 2 ? '1fr 1fr' : '1fr 1fr 1fr',
                gap: 12,
                marginBottom: 16,
              }}>
                {result.perspectives.map((p, idx) => {
                  const color = PERSPECTIVE_COLORS[idx % PERSPECTIVE_COLORS.length];
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: 14,
                        background: color.bg,
                        border: `1px solid ${color.border}`,
                        borderRadius: 10,
                      }}
                    >
                      <div style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: 1,
                        color: color.label,
                        background: color.labelBg,
                        padding: '2px 6px',
                        borderRadius: 4,
                        border: `1px solid ${color.labelBorder}`,
                        display: 'inline-block',
                        marginBottom: 8,
                      }}>
                        PERSPECTIVE {String.fromCharCode(65 + idx)}
                      </div>
                      <div style={{ color: color.text, fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                        {p.tradition}
                      </div>
                      <div style={{ color: '#ffffffbb', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-line', marginBottom: 10 }}>
                        {p.narrative}
                      </div>

                      {/* Key differences */}
                      {p.keyDifferences?.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: '#ffffff40', fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>
                            KEY DIFFERENCES
                          </div>
                          {p.keyDifferences.map((diff, di) => (
                            <div
                              key={di}
                              style={{
                                padding: '4px 8px',
                                marginBottom: 3,
                                background: color.diff,
                                borderRadius: 4,
                                fontSize: 11,
                                color: '#ffffffaa',
                                lineHeight: 1.5,
                              }}
                            >
                              {diff}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Consensus */}
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
                  SCHOLARLY CONSENSUS
                </div>
                <div style={{ color: '#ffffffcc', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                  {result.consensus}
                </div>
              </div>

              {/* Bottom disclaimer */}
              <div style={{
                textAlign: 'center',
                padding: '10px 0',
                fontSize: 10,
                color: '#c4b5fd',
                borderTop: '1px solid rgba(168, 85, 247, 0.15)',
              }}>
                These represent historiographic traditions, not individual opinions.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
