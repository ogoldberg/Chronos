import { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────

interface TodayEvent {
  year: number;
  title: string;
  description: string;
  theme: string;
  wikipedia?: { title: string; url: string; thumbnail?: string; extract?: string };
  source: 'wikipedia' | 'wikidata';
}

interface EventDetail {
  narrative: string;
  significance: string;
  connections: string[];
  funFact: string;
}

interface Props {
  onNavigate: (year: number, span: number) => void;
  onClose: () => void;
}

// ── Constants ────────────────────────────────────────────────────────

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const THEME_LABELS: Record<string, { label: string; icon: string }> = {
  'war-conflict':          { label: 'War & Conflict',      icon: '\u2694\uFE0F' },
  'politics-governance':   { label: 'Politics',            icon: '\uD83C\uDFDB\uFE0F' },
  'science-technology':    { label: 'Science & Tech',      icon: '\uD83D\uDD2C' },
  'exploration-geography': { label: 'Exploration',         icon: '\uD83E\uDDED' },
  'culture-arts':          { label: 'Culture & Arts',      icon: '\uD83C\uDFA8' },
  'religion-philosophy':   { label: 'Religion',            icon: '\u2721\uFE0F' },
  'disaster-tragedy':      { label: 'Disasters',           icon: '\u26A0\uFE0F' },
  'sports':                { label: 'Sports',              icon: '\uD83C\uDFC6' },
  'birth':                 { label: 'Born',                icon: '\uD83C\uDF1F' },
  'death':                 { label: 'Died',                icon: '\uD83D\uDD4A\uFE0F' },
  'other':                 { label: 'Other',               icon: '\uD83D\uDCCC' },
};

// ── Helpers ──────────────────────────────────────────────────────────

function getCacheKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `chronos_today_v2_${yyyy}-${mm}-${dd}`;
}

function getToday(): { month: number; day: number } {
  const d = new Date();
  return { month: d.getMonth() + 1, day: d.getDate() };
}

function msUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

function formatYear(year: number): string {
  if (year < 0) return `${Math.abs(year)} BCE`;
  return String(year);
}

function getThemeInfo(theme: string): { label: string; icon: string } {
  return THEME_LABELS[theme] ?? THEME_LABELS['other']!;
}

// ── Component ────────────────────────────────────────────────────────

function TodayInHistory({ onNavigate, onClose }: Props) {
  const [events, setEvents] = useState<TodayEvent[]>([]);
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shareMsg, setShareMsg] = useState('');
  const [expandedEvent, setExpandedEvent] = useState<number | null>(null);
  const [eventDetails, setEventDetails] = useState<Record<string, EventDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const midnightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { month, day } = getToday();
  const dateLabel = `${MONTH_NAMES[month]} ${day}`;

  const fetchEvents = useCallback(async () => {
    const cacheKey = getCacheKey();
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setEvents(parsed.events);
        setTotalAvailable(parsed.total);
        return;
      } catch { /* ignore bad cache */ }
    }

    setLoading(true);
    setError('');
    try {
      const resp = await fetch('/api/today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, day }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || 'Request failed');
      }
      const data = await resp.json();
      const evts: TodayEvent[] = data.events || [];
      const total: number = data.total || evts.length;
      setEvents(evts);
      setTotalAvailable(total);
      localStorage.setItem(cacheKey, JSON.stringify({ events: evts, total }));
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [month, day]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Auto-refresh at midnight
  useEffect(() => {
    const schedule = () => {
      midnightTimer.current = setTimeout(() => {
        setEvents([]);
        fetchEvents();
        schedule();
      }, msUntilMidnight());
    };
    schedule();
    return () => {
      if (midnightTimer.current) clearTimeout(midnightTimer.current);
    };
  }, [fetchEvents]);

  // ── AI detail on demand ──────────────────────────────────────────

  const fetchDetail = async (evt: TodayEvent) => {
    const key = `${evt.year}-${evt.title}`;
    if (eventDetails[key]) return; // Already loaded

    setLoadingDetail(key);
    try {
      const resp = await fetch('/api/today/detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: evt.year,
          title: evt.title,
          description: evt.description,
          wikiTitle: evt.wikipedia?.title,
        }),
      });
      if (!resp.ok) throw new Error('Failed to load detail');
      const data = await resp.json();
      setEventDetails(prev => ({ ...prev, [key]: data.detail }));
    } catch {
      // Silently fail — the base content is still visible
    } finally {
      setLoadingDetail(null);
    }
  };

  const handleExpand = (index: number, evt: TodayEvent) => {
    if (expandedEvent === index) {
      setExpandedEvent(null);
      return;
    }
    setExpandedEvent(index);
    fetchDetail(evt);
  };

  // ── Share ────────────────────────────────────────────────────────

  const handleShare = () => {
    const lines = events.slice(0, 5).map((e) => {
      const info = getThemeInfo(e.theme);
      return `${info.icon} ${formatYear(e.year)} - ${e.title}`;
    });
    const text = `On this day in history (${dateLabel}):\n\n${lines.join('\n')}\n\nvia CHRONOS`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setShareMsg('Copied!');
        setTimeout(() => setShareMsg(''), 2000);
      });
    }
  };

  const handleViewOnTimeline = (evt: TodayEvent) => {
    const span = Math.abs(evt.year) > 1000 ? 200 : 100;
    onNavigate(evt.year, span);
  };

  // Pick a random highlight from non-birth/death events
  const highlight = events.find(e => e.theme !== 'birth' && e.theme !== 'death' && e.wikipedia?.extract)
    || events[0];

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        width: 460,
        maxWidth: 'calc(100vw - 40px)',
        maxHeight: 'calc(100vh - 100px)',
        background: 'linear-gradient(135deg, rgba(30, 20, 10, 0.97), rgba(20, 15, 8, 0.97))',
        borderRadius: 16,
        border: '1px solid rgba(255, 180, 60, 0.15)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 60px rgba(255,160,40,0.05)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '18px 20px 14px',
          borderBottom: '1px solid rgba(255,180,60,0.1)',
          background: 'linear-gradient(135deg, rgba(255,160,40,0.08), transparent)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 26 }}>{'\uD83D\uDCC5'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#ffcc70', fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>
              {dateLabel}
            </div>
            <div style={{ color: 'rgba(255,200,120,0.5)', fontSize: 11, fontFamily: 'monospace' }}>
              Today in History {totalAvailable > 0 ? `\u00b7 ${totalAvailable} events found` : ''}
            </div>
          </div>
          <button
            onClick={handleShare}
            style={{
              background: 'rgba(255,180,60,0.12)',
              border: '1px solid rgba(255,180,60,0.2)',
              borderRadius: 8,
              padding: '6px 12px',
              color: '#ffcc70',
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {shareMsg || '\uD83D\uDD17 Share'}
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              fontSize: 18,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            {'\u2715'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 18px',
          minHeight: 0,
        }}
      >
        {loading && (
          <div style={{ color: 'rgba(255,200,120,0.5)', fontSize: 13, textAlign: 'center', padding: '30px 0' }}>
            Discovering what happened on {dateLabel}...
          </div>
        )}

        {error && (
          <div
            style={{
              color: '#ff6b6b',
              fontSize: 13,
              padding: '8px 12px',
              background: 'rgba(255,107,107,0.1)',
              borderRadius: 8,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        {/* Highlight card */}
        {!loading && highlight && highlight.wikipedia?.extract && (
          <div
            style={{
              background: 'rgba(255,180,60,0.08)',
              border: '1px solid rgba(255,180,60,0.15)',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 16,
              display: 'flex',
              gap: 12,
            }}
          >
            {highlight.wikipedia?.thumbnail && (
              <img
                src={highlight.wikipedia.thumbnail}
                alt=""
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 8,
                  objectFit: 'cover',
                  flexShrink: 0,
                }}
              />
            )}
            <div>
              <div style={{ color: '#ffcc70', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                {'\u2728'} Spotlight: {formatYear(highlight.year)}
              </div>
              <div style={{ color: 'rgba(255,230,180,0.9)', fontSize: 13, lineHeight: 1.5 }}>
                {highlight.wikipedia.extract!.slice(0, 200)}
                {(highlight.wikipedia.extract!.length > 200) ? '...' : ''}
              </div>
            </div>
          </div>
        )}

        {/* Event cards */}
        {events.map((evt, i) => {
          const themeInfo = getThemeInfo(evt.theme);
          const isExpanded = expandedEvent === i;
          const detailKey = `${evt.year}-${evt.title}`;
          const detail = eventDetails[detailKey];
          const isLoadingThis = loadingDetail === detailKey;

          return (
            <div
              key={`${evt.year}-${i}`}
              style={{
                background: isExpanded ? 'rgba(255,180,60,0.06)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isExpanded ? 'rgba(255,180,60,0.2)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 12,
                padding: '14px 16px',
                marginBottom: 10,
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{themeInfo.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        color: '#ffcc70',
                        fontSize: 13,
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        flexShrink: 0,
                      }}
                    >
                      {formatYear(evt.year)}
                    </span>
                    <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
                      {evt.title}
                    </span>
                  </div>

                  {/* Theme tag + source indicator */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span
                      style={{
                        fontSize: 10,
                        color: 'rgba(255,200,120,0.6)',
                        background: 'rgba(255,180,60,0.1)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontWeight: 600,
                      }}
                    >
                      {themeInfo.label}
                    </span>
                    {evt.source === 'wikidata' && (
                      <span
                        style={{
                          fontSize: 10,
                          color: 'rgba(120,180,255,0.6)',
                          background: 'rgba(120,180,255,0.1)',
                          padding: '2px 6px',
                          borderRadius: 4,
                        }}
                      >
                        Wikidata
                      </span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handleViewOnTimeline(evt)}
                      style={{
                        background: 'rgba(255,180,60,0.1)',
                        border: '1px solid rgba(255,180,60,0.2)',
                        borderRadius: 8,
                        padding: '5px 12px',
                        color: '#ffcc70',
                        fontSize: 11,
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      View on Timeline
                    </button>
                    <button
                      onClick={() => handleExpand(i, evt)}
                      style={{
                        background: isExpanded ? 'rgba(255,180,60,0.15)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${isExpanded ? 'rgba(255,180,60,0.3)' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 8,
                        padding: '5px 12px',
                        color: isExpanded ? '#ffcc70' : 'rgba(255,255,255,0.6)',
                        fontSize: 11,
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {isExpanded ? 'Less' : 'Tell me more'}
                    </button>
                    {evt.wikipedia?.url && (
                      <a
                        href={evt.wikipedia.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 8,
                          padding: '5px 12px',
                          color: 'rgba(255,255,255,0.5)',
                          fontSize: 11,
                          textDecoration: 'none',
                          fontWeight: 600,
                        }}
                      >
                        Wikipedia
                      </a>
                    )}
                  </div>

                  {/* Expanded detail (AI-powered, on demand) */}
                  {isExpanded && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: '12px 14px',
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: 10,
                        borderLeft: '3px solid rgba(255,180,60,0.3)',
                      }}
                    >
                      {isLoadingThis && (
                        <div style={{ color: 'rgba(255,200,120,0.5)', fontSize: 12 }}>
                          Loading deeper context...
                        </div>
                      )}
                      {detail && (
                        <>
                          <div style={{ color: 'rgba(255,230,180,0.9)', fontSize: 13, lineHeight: 1.6, marginBottom: 10 }}>
                            {detail.narrative}
                          </div>
                          <div style={{ color: 'rgba(255,200,120,0.7)', fontSize: 12, marginBottom: 8, fontStyle: 'italic' }}>
                            {detail.significance}
                          </div>
                          {detail.funFact && (
                            <div
                              style={{
                                background: 'rgba(255,180,60,0.08)',
                                borderRadius: 8,
                                padding: '8px 10px',
                                marginBottom: 8,
                              }}
                            >
                              <span style={{ color: '#ffcc70', fontSize: 11, fontWeight: 700 }}>Fun fact: </span>
                              <span style={{ color: 'rgba(255,230,180,0.8)', fontSize: 12 }}>{detail.funFact}</span>
                            </div>
                          )}
                          {detail.connections?.length > 0 && (
                            <div style={{ marginTop: 6 }}>
                              <div style={{ color: 'rgba(255,200,120,0.5)', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                                CONNECTED EVENTS
                              </div>
                              {detail.connections.map((c, ci) => (
                                <div
                                  key={ci}
                                  style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, lineHeight: 1.5, paddingLeft: 8 }}
                                >
                                  {'\u2022'} {c}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                      {!isLoadingThis && !detail && (
                        <div style={{ color: 'rgba(255,230,180,0.9)', fontSize: 13, lineHeight: 1.6 }}>
                          {evt.description}
                          {evt.wikipedia?.extract && (
                            <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                              {evt.wikipedia.extract.slice(0, 300)}
                              {evt.wikipedia.extract.length > 300 ? '...' : ''}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Thumbnail */}
                {evt.wikipedia?.thumbnail && !isExpanded && (
                  <img
                    src={evt.wikipedia.thumbnail}
                    alt=""
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 6,
                      objectFit: 'cover',
                      flexShrink: 0,
                      opacity: 0.8,
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}

        {!loading && events.length === 0 && !error && (
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', padding: '30px 10px' }}>
            No events found for today. Try refreshing!
          </div>
        )}
      </div>
    </div>
  );
}

export default TodayInHistory;
