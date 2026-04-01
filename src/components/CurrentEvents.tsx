import { useState } from 'react';

interface ParallelEvent {
  title: string;
  year: number;
  emoji: string;
  color: string;
  description: string;
  parallel: string;
  wiki?: string;
  lat?: number;
  lng?: number;
  geoType?: string;
}

interface Props {
  onClose: () => void;
  onNavigate: (year: number, span: number) => void;
  onAddEvents: (events: ParallelEvent[]) => void;
}

const SUGGESTION_CHIPS = [
  'AI Regulation',
  'Climate Change',
  'Rising Populism',
  'Pandemic Response',
  'Space Race 2.0',
  'Trade Wars',
];

function CurrentEvents({ onClose, onNavigate, onAddEvents }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ParallelEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const findParallels = async (text: string) => {
    const q = text.trim();
    if (!q) return;
    setQuery(q);
    setLoading(true);
    setError('');
    setResults([]);

    try {
      const resp = await fetch('/api/parallels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || 'Request failed');
      }
      const data = await resp.json();
      const events: ParallelEvent[] = data.events || [];
      setResults(events);

      // Add events to the timeline
      if (events.length > 0) {
        const timelineEvents = events
          .filter((e) => e.title && e.year != null)
          .map((e, i) => ({
            id: `parallel-${Date.now()}-${i}`,
            title: e.title,
            year: e.year,
            emoji: e.emoji || '\u{1F4CD}',
            color: e.color || '#888',
            description: e.description || '',
            category: 'civilization' as const,
            source: 'discovered' as const,
            wiki: e.wiki,
            lat: e.lat,
            lng: e.lng,
            geoType: e.geoType,
          }));
        onAddEvents(timelineEvents);
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleViewOnTimeline = (evt: ParallelEvent) => {
    const span = Math.abs(evt.year) > 1000 ? 200 : 100;
    onNavigate(evt.year, span);
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        width: 420,
        maxWidth: 'calc(100vw - 40px)',
        maxHeight: 'calc(100vh - 100px)',
        background: 'rgba(13, 17, 23, 0.95)',
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 20 }}>{'\u{1F517}'}</span>
        <div>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>
            History Repeats
          </div>
          <div
            style={{
              color: '#ffffff50',
              fontSize: 10,
              fontFamily: 'monospace',
            }}
          >
            Current Events {'\u2192'} Historical Parallels
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            color: '#ffffff60',
            fontSize: 18,
            cursor: 'pointer',
            padding: 4,
          }}
        >
          {'\u2715'}
        </button>
      </div>

      {/* Input area */}
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading) findParallels(query);
          }}
          placeholder="Paste a headline or describe a current event..."
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10,
            padding: '10px 14px',
            color: '#fff',
            fontSize: 13,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <button
          onClick={() => findParallels(query)}
          disabled={loading || !query.trim()}
          style={{
            marginTop: 10,
            width: '100%',
            background:
              loading || !query.trim()
                ? 'rgba(255,255,255,0.05)'
                : 'rgba(59, 130, 246, 0.3)',
            border: '1px solid rgba(59,130,246,0.3)',
            borderRadius: 10,
            padding: '10px 16px',
            color: '#fff',
            cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {loading ? 'Searching history...' : 'Find Parallels'}
        </button>
      </div>

      {/* Suggestion chips */}
      <div
        style={{
          padding: '10px 18px',
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        {SUGGESTION_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => !loading && findParallels(chip)}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: '4px 10px',
              color: '#ffffff80',
              fontSize: 11,
              cursor: loading ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Results */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 18px',
          minHeight: 0,
        }}
      >
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

        {results.length === 0 && !loading && !error && (
          <div
            style={{
              color: '#ffffff40',
              fontSize: 13,
              textAlign: 'center',
              padding: '30px 10px',
              lineHeight: 1.6,
            }}
          >
            Type a current event or headline above, or tap a suggestion chip to
            discover how history echoes through time.
          </div>
        )}

        {results.map((evt, i) => (
          <div
            key={`${evt.title}-${i}`}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 22 }}>{evt.emoji}</span>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    lineHeight: 1.3,
                  }}
                >
                  {evt.title}
                </div>
                <div
                  style={{
                    color: evt.color || '#ffffff60',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    marginTop: 2,
                  }}
                >
                  {evt.year < 0
                    ? `${Math.abs(evt.year).toLocaleString()} BCE`
                    : `${evt.year} CE`}
                </div>
              </div>
            </div>

            <div
              style={{
                color: '#ffffffbb',
                fontSize: 12,
                lineHeight: 1.5,
                marginBottom: 8,
              }}
            >
              {evt.description}
            </div>

            <div
              style={{
                color: '#7eb8ff',
                fontSize: 12,
                lineHeight: 1.5,
                padding: '8px 10px',
                background: 'rgba(59,130,246,0.08)',
                borderRadius: 8,
                borderLeft: '3px solid rgba(59,130,246,0.3)',
                marginBottom: 10,
              }}
            >
              {evt.parallel}
            </div>

            <button
              onClick={() => handleViewOnTimeline(evt)}
              style={{
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59,130,246,0.25)',
                borderRadius: 8,
                padding: '6px 14px',
                color: '#7eb8ff',
                fontSize: 11,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              View on Timeline
            </button>
          </div>
        ))}

        {loading && (
          <div
            style={{
              color: '#ffffff50',
              fontSize: 12,
              textAlign: 'center',
              padding: '20px 0',
            }}
          >
            Searching across millennia of history...
          </div>
        )}
      </div>
    </div>
  );
}

export default CurrentEvents;
