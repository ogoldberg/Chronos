import { useState, useEffect, useRef, useCallback } from 'react';

interface TodayEvent {
  year: number;
  emoji: string;
  title: string;
  description: string;
  didYouKnow?: boolean;
  citations?: { source: string; title: string; url?: string }[];
}

interface Props {
  onNavigate: (year: number, span: number) => void;
  onClose: () => void;
}

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getCacheKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `chronos_today_${yyyy}-${mm}-${dd}`;
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

function TodayInHistory({ onNavigate, onClose }: Props) {
  const [events, setEvents] = useState<TodayEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shareMsg, setShareMsg] = useState('');
  const midnightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { month, day } = getToday();
  const dateLabel = `${MONTH_NAMES[month]} ${day}`;

  const fetchEvents = useCallback(async () => {
    const cacheKey = getCacheKey();
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        setEvents(JSON.parse(cached));
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
      setEvents(evts);
      localStorage.setItem(cacheKey, JSON.stringify(evts));
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

  const surprise = events.find((e) => e.didYouKnow) || events[0];

  const handleShare = () => {
    const lines = events.slice(0, 5).map(
      (e) => `${e.emoji} ${e.year} - ${e.title}`,
    );
    const text = `On this day in history (${dateLabel}):\n\n${lines.join('\n')}\n\nvia CHRONOS`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setShareMsg('Copied to clipboard!');
        setTimeout(() => setShareMsg(''), 2000);
      });
    }
  };

  const handleViewOnTimeline = (evt: TodayEvent) => {
    const span = Math.abs(evt.year) > 1000 ? 200 : 100;
    onNavigate(evt.year, span);
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        width: 440,
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
              Today in History
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

        {/* Did You Know? highlight */}
        {!loading && surprise && (
          <div
            style={{
              background: 'rgba(255,180,60,0.08)',
              border: '1px solid rgba(255,180,60,0.15)',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 16,
            }}
          >
            <div style={{ color: '#ffcc70', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              {'\u2728'} Did you know?
            </div>
            <div style={{ color: 'rgba(255,230,180,0.9)', fontSize: 13, lineHeight: 1.5 }}>
              In {surprise.year}, {surprise.title.toLowerCase()} — {surprise.description}
            </div>
          </div>
        )}

        {/* Event cards */}
        {events.map((evt, i) => (
          <div
            key={`${evt.year}-${i}`}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 24, lineHeight: 1 }}>{evt.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <span
                    style={{
                      color: '#ffcc70',
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: 'monospace',
                    }}
                  >
                    {evt.year < 0 ? `${Math.abs(evt.year)} BCE` : evt.year}
                  </span>
                  <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
                    {evt.title}
                  </span>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
                  {evt.description}
                </div>
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
              </div>
            </div>
          </div>
        ))}

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
