import { useState, useCallback, useMemo, useEffect } from 'react';
import type { HistoricalMyth } from '../../data/myths';
import { MYTHS } from '../../data/myths';
import { callAI } from '../../ai/callAI';
import { MYTHS_SYSTEM } from '../../ai/prompts';

interface Props {
  onNavigate?: (year: number, span: number) => void;
  onAskAI?: (message: string) => void;
  onClose?: () => void;
  centerYear?: number;
  span?: number;
}

const CATEGORIES = ['all', 'people', 'events', 'science', 'culture'] as const;

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  people: 'People',
  events: 'Events',
  science: 'Science',
  culture: 'Culture',
};

export default function MythBuster({ onNavigate, onAskAI, onClose, centerYear, span }: Props) {
  const [category, setCategory] = useState<string>('all');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [aiMyths, setAiMyths] = useState<HistoricalMyth[]>([]);
  const [loadingAI, setLoadingAI] = useState(false);
  const [flipKey, setFlipKey] = useState(0);

  const filteredMyths = useMemo(() => {
    const base = [...MYTHS, ...aiMyths];
    if (category === 'all') return base;
    return base.filter((m) => m.category === category);
  }, [category, aiMyths]);

  const currentMyth = filteredMyths[currentIndex] ?? filteredMyths[0];

  const navigate = useCallback(
    (direction: 'next' | 'prev') => {
      setRevealed(false);
      setFlipKey((k) => k + 1);
      if (direction === 'next') {
        setCurrentIndex((i) => (i + 1) % filteredMyths.length);
      } else {
        setCurrentIndex((i) => (i - 1 + filteredMyths.length) % filteredMyths.length);
      }
    },
    [filteredMyths.length],
  );

  const goRandom = useCallback(() => {
    setRevealed(false);
    setFlipKey((k) => k + 1);
    let next = Math.floor(Math.random() * filteredMyths.length);
    if (next === currentIndex && filteredMyths.length > 1) {
      next = (next + 1) % filteredMyths.length;
    }
    setCurrentIndex(next);
  }, [filteredMyths.length, currentIndex]);

  const handleReveal = useCallback(() => {
    setRevealed(true);
    // Award XP for revealing a myth
    import('../gamification/gamification').then(g => g.recordMythRevealed());
    // Add to spaced repetition deck
    if (currentMyth) {
      import('../gamification/spacedRepetition').then(sr => sr.addReviewCard({
        id: `myth-${currentMyth.id}`,
        eventTitle: currentMyth.myth.slice(0, 60),
        eventYear: currentMyth.year,
        question: `Myth or Reality? "${currentMyth.myth}"`,
        answer: currentMyth.truth,
      }));
    }
  }, [currentMyth]);

  const handleCategoryChange = useCallback((cat: string) => {
    setCategory(cat);
    setCurrentIndex(0);
    setRevealed(false);
    setFlipKey((k) => k + 1);
  }, []);

  // Fetch AI-generated myths for current timeline view
  const fetchAIMyths = useCallback(async () => {
    if (!centerYear || !span) return;
    setLoadingAI(true);
    try {
      const system = MYTHS_SYSTEM(centerYear, span);
      const { text } = await callAI(
        system,
        [{ role: 'user', content: `Generate 3 historical myths/misconceptions for the period around year ${centerYear} (span: ${span} years).` }],
        { maxTokens: 1500, webSearch: true },
      );
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      let myths: HistoricalMyth[] = [];
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed)) myths = parsed;
        } catch { /* ignore */ }
      }
      {
        const data = { myths } as { myths?: HistoricalMyth[] };
        if (data.myths?.length) {
          setAiMyths((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newMyths = data.myths!.filter((m) => !existingIds.has(m.id));
            return [...prev, ...newMyths];
          });
        }
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingAI(false);
    }
  }, [centerYear, span]);

  // Reset index when filtered list changes
  useEffect(() => {
    if (currentIndex >= filteredMyths.length) {
      setCurrentIndex(0);
    }
  }, [filteredMyths.length, currentIndex]);

  if (!currentMyth) return null;

  const mythYear = currentMyth.year;
  const yearLabel = mythYear < 0 ? `${Math.abs(mythYear)} BCE` : `${mythYear} CE`;

  return (
    <div
      style={{
        position: 'absolute',
        top: 80,
        right: 20,
        width: collapsed ? 44 : 380,
        background: 'rgba(13, 17, 23, 0.92)',
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(20px)',
        zIndex: 30,
        overflow: 'hidden',
        transition: 'width 0.3s ease',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
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
        <span style={{ fontSize: 16 }}>🔍</span>
        {!collapsed && (
          <span
            style={{
              color: '#ffffffbb',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            MYTH vs. REALITY
          </span>
        )}
        {!collapsed && onClose && (
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#ffffff40', cursor: 'pointer', fontSize: 14 }}
          >
            ✕
          </button>
        )}
        {!collapsed && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              color: '#ffffff50',
              fontFamily: 'monospace',
            }}
          >
            {currentIndex + 1}/{filteredMyths.length}
          </span>
        )}
      </div>

      {!collapsed && (
        <div style={{ padding: '0 16px 16px' }}>
          {/* Category tabs */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              marginBottom: 12,
              marginTop: 8,
              flexWrap: 'wrap',
            }}
          >
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => handleCategoryChange(cat)}
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  background:
                    category === cat
                      ? 'rgba(99, 102, 241, 0.4)'
                      : 'rgba(255,255,255,0.06)',
                  color: category === cat ? '#fff' : '#ffffff80',
                  fontWeight: category === cat ? 600 : 400,
                  transition: 'all 0.2s',
                }}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          {/* Myth Card */}
          <div
            key={flipKey}
            style={{
              perspective: '800px',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                position: 'relative',
                transformStyle: 'preserve-3d',
                transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: revealed ? 'rotateX(180deg)' : 'rotateX(0)',
              }}
            >
              {/* Front — Myth side */}
              <div
                style={{
                  backfaceVisibility: 'hidden',
                  background: 'rgba(220, 38, 38, 0.08)',
                  border: '1px solid rgba(220, 38, 38, 0.3)',
                  borderRadius: 12,
                  padding: 16,
                  ...(revealed
                    ? { position: 'absolute', top: 0, left: 0, right: 0 }
                    : {}),
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      background: 'rgba(220, 38, 38, 0.3)',
                      color: '#fca5a5',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                      letterSpacing: 1,
                    }}
                  >
                    ❌ MYTH
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: '#ffffff50',
                      fontFamily: 'monospace',
                    }}
                  >
                    ~{yearLabel}
                  </span>
                  <span style={{ fontSize: 18, marginLeft: 'auto' }}>
                    {currentMyth.emoji}
                  </span>
                </div>
                <p
                  style={{
                    color: '#ffffffdd',
                    fontSize: 14,
                    lineHeight: 1.5,
                    margin: 0,
                    fontStyle: 'italic',
                  }}
                >
                  &quot;{currentMyth.myth}&quot;
                </p>
                {!revealed && (
                  <button
                    onClick={handleReveal}
                    style={{
                      marginTop: 12,
                      width: '100%',
                      padding: '8px 0',
                      background:
                        'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))',
                      border: '1px solid rgba(99,102,241,0.3)',
                      borderRadius: 8,
                      color: '#c7d2fe',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    Reveal the Truth
                  </button>
                )}
              </div>

              {/* Back — Truth side */}
              <div
                style={{
                  backfaceVisibility: 'hidden',
                  transform: 'rotateX(180deg)',
                  background: 'rgba(34, 197, 94, 0.08)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: 12,
                  padding: 16,
                  ...(revealed
                    ? {}
                    : { position: 'absolute', top: 0, left: 0, right: 0 }),
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      background: 'rgba(34, 197, 94, 0.3)',
                      color: '#86efac',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                      letterSpacing: 1,
                    }}
                  >
                    ✅ REALITY
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: '#ffffff50',
                      fontFamily: 'monospace',
                    }}
                  >
                    ~{yearLabel}
                  </span>
                  <span style={{ fontSize: 18, marginLeft: 'auto' }}>
                    {currentMyth.emoji}
                  </span>
                </div>
                <p
                  style={{
                    color: '#ffffffdd',
                    fontSize: 13,
                    lineHeight: 1.6,
                    margin: '0 0 12px 0',
                  }}
                >
                  {currentMyth.truth}
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {onNavigate && (
                    <button
                      onClick={() => onNavigate(mythYear, Math.max(50, Math.abs(mythYear) * 0.1))}
                      style={{
                        padding: '5px 10px',
                        fontSize: 11,
                        background: 'rgba(99,102,241,0.2)',
                        border: '1px solid rgba(99,102,241,0.3)',
                        borderRadius: 6,
                        color: '#c7d2fe',
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      View on Timeline
                    </button>
                  )}
                  <a
                    href={`https://en.wikipedia.org/wiki/${currentMyth.wiki}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '5px 10px',
                      fontSize: 11,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 6,
                      color: '#ffffffaa',
                      cursor: 'pointer',
                      textDecoration: 'none',
                      fontWeight: 500,
                    }}
                  >
                    Wikipedia
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
            }}
          >
            <button
              onClick={() => navigate('prev')}
              style={{
                flex: 1,
                padding: '6px 0',
                fontSize: 11,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                color: '#ffffffaa',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Previous
            </button>
            <button
              onClick={goRandom}
              style={{
                flex: 1,
                padding: '6px 0',
                fontSize: 11,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                color: '#fbbf24',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              🎲 Random
            </button>
            <button
              onClick={() => navigate('next')}
              style={{
                flex: 1,
                padding: '6px 0',
                fontSize: 11,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                color: '#ffffffaa',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Next
            </button>
          </div>

          {/* Bottom actions */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              marginTop: 8,
            }}
          >
            {onAskAI && (
              <button
                onClick={() =>
                  onAskAI(
                    `Tell me more about this historical myth: "${currentMyth.myth}" — Is it true? What's the real story?`,
                  )
                }
                style={{
                  flex: 1,
                  padding: '7px 0',
                  fontSize: 11,
                  background:
                    'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(99,102,241,0.2))',
                  border: '1px solid rgba(139,92,246,0.3)',
                  borderRadius: 6,
                  color: '#c4b5fd',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                🤖 Ask AI
              </button>
            )}
            <button
              onClick={fetchAIMyths}
              disabled={loadingAI}
              style={{
                flex: 1,
                padding: '7px 0',
                fontSize: 11,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                color: loadingAI ? '#ffffff40' : '#ffffffaa',
                cursor: loadingAI ? 'default' : 'pointer',
                fontWeight: 500,
              }}
            >
              {loadingAI ? 'Loading...' : '✨ Discover More'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
