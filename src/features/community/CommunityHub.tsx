import { useState, useEffect, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SharedLens {
  id: string;
  emoji: string;
  name: string;
  description: string;
  creator: string;
  useCount: number;
  color: string;
  tags: string[];
}

interface SharedTour {
  id: string;
  title: string;
  description: string;
  stopCount: number;
  playCount: number;
  creator: string;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Tabs                                                               */
/* ------------------------------------------------------------------ */

type Tab = 'lenses' | 'tours';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CommunityHub({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('lenses');
  const [lenses, setLenses] = useState<SharedLens[]>([]);
  const [tours, setTours] = useState<SharedTour[]>([]);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  /* ---- Fetch community content ---- */

  const fetchLenses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/community/lenses');
      if (res.ok) {
        const data = await res.json();
        setLenses(data.lenses ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const fetchTours = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/community/tours');
      if (res.ok) {
        const data = await res.json();
        setTours(data.tours ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'lenses') fetchLenses();
    else fetchTours();
  }, [tab, fetchLenses, fetchTours]);

  /* ---- Share actions ---- */

  const shareLens = async () => {
    if (sharing) return;
    // Get the user's currently active custom lens from localStorage
    const raw = localStorage.getItem('chronos-custom-lenses');
    if (!raw) { setShareStatus('No custom lenses to share.'); return; }
    const custom = JSON.parse(raw);
    if (!custom.length) { setShareStatus('No custom lenses to share.'); return; }
    const latest = custom[custom.length - 1];
    setSharing(true);
    setShareStatus('Sharing…');
    try {
      const res = await fetch('/api/community/lenses/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(latest),
      });
      if (res.ok) {
        setShareStatus('Lens shared with the community!');
        fetchLenses();
      } else {
        const err = await res.json();
        setShareStatus(err.error || 'Failed to share lens.');
      }
    } catch {
      setShareStatus('Network error.');
    } finally {
      setSharing(false);
    }
    setTimeout(() => setShareStatus(null), 3000);
  };

  const shareTour = async () => {
    if (sharing) return;
    const raw = localStorage.getItem('chronos-custom-tours');
    if (!raw) { setShareStatus('No custom tours to share.'); return; }
    const custom = JSON.parse(raw);
    if (!custom.length) { setShareStatus('No custom tours to share.'); return; }
    const latest = custom[custom.length - 1];
    setSharing(true);
    setShareStatus('Sharing…');
    try {
      const res = await fetch('/api/community/tours/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(latest),
      });
      if (res.ok) {
        setShareStatus('Tour shared with the community!');
        fetchTours();
      } else {
        const err = await res.json();
        setShareStatus(err.error || 'Failed to share tour.');
      }
    } catch {
      setShareStatus('Network error.');
    } finally {
      setSharing(false);
    }
    setTimeout(() => setShareStatus(null), 3000);
  };

  /* ---- Activate lens / start tour ---- */

  const activateLens = (lens: SharedLens) => {
    // Store in localStorage and dispatch a custom event so LensExplorer can pick it up
    const customLenses = JSON.parse(localStorage.getItem('chronos-custom-lenses') || '[]');
    const exists = customLenses.find((l: any) => l.id === lens.id);
    if (!exists) {
      customLenses.push({
        id: lens.id,
        name: lens.name,
        emoji: lens.emoji,
        description: lens.description,
        category: 'custom',
        tags: lens.tags,
        color: lens.color,
      });
      localStorage.setItem('chronos-custom-lenses', JSON.stringify(customLenses));
    }
    window.dispatchEvent(new CustomEvent('chronos-activate-lens', { detail: lens }));
  };

  const startTour = (tour: SharedTour) => {
    window.dispatchEvent(new CustomEvent('chronos-start-tour', { detail: tour }));
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={{ fontSize: 18 }}>🌐</span>
        <span style={{ color: '#ffffffdd', fontSize: 14, fontWeight: 700, letterSpacing: 0.5 }}>
          Community Hub
        </span>
        <button onClick={onClose} style={closeBtnStyle} aria-label="Close">
          ✕
        </button>
      </div>

      {/* Status banner */}
      {shareStatus && (
        <div style={{
          padding: '8px 16px',
          background: 'rgba(34, 197, 94, 0.12)',
          borderBottom: '1px solid rgba(34, 197, 94, 0.2)',
          color: '#22c55e',
          fontSize: 12,
          fontWeight: 500,
        }}>
          {shareStatus}
        </div>
      )}

      {/* Tab bar */}
      <div style={tabBarStyle}>
        {(['lenses', 'tours'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...tabBtnBase,
              background: tab === t ? 'rgba(255,255,255,0.12)' : 'transparent',
              color: tab === t ? '#ffffffdd' : '#ffffff60',
              fontWeight: tab === t ? 600 : 400,
            }}
          >
            {t === 'lenses' ? 'Shared Lenses' : 'Shared Tours'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={gridContainerStyle}>
        {loading && (
          <div style={{ color: '#ffffff50', fontSize: 12, padding: 20, textAlign: 'center', gridColumn: '1 / -1' }}>
            Loading...
          </div>
        )}

        {/* Shared Lenses */}
        {tab === 'lenses' && !loading && lenses.map(lens => (
          <div
            key={lens.id}
            onClick={() => activateLens(lens)}
            style={{
              ...cardStyle,
              borderLeft: `3px solid ${lens.color}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 22 }}>{lens.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#ffffffdd', fontSize: 13, fontWeight: 600 }}>{lens.name}</div>
                <div style={{ color: '#ffffff50', fontSize: 10 }}>by {lens.creator}</div>
              </div>
              <div style={{
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 8,
                padding: '2px 8px',
                fontSize: 10,
                color: '#ffffff60',
              }}>
                {lens.useCount} uses
              </div>
            </div>
            <div style={{ color: '#ffffff70', fontSize: 11, lineHeight: 1.45 }}>
              {lens.description}
            </div>
          </div>
        ))}

        {tab === 'lenses' && !loading && lenses.length === 0 && (
          <div style={{ color: '#ffffff40', fontSize: 12, padding: 20, textAlign: 'center', gridColumn: '1 / -1' }}>
            No shared lenses yet. Be the first to share one!
          </div>
        )}

        {/* Shared Tours */}
        {tab === 'tours' && !loading && tours.map(tour => (
          <div
            key={tour.id}
            onClick={() => startTour(tour)}
            style={cardStyle}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 18 }}>🗺️</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#ffffffdd', fontSize: 13, fontWeight: 600 }}>{tour.title}</div>
                <div style={{ color: '#ffffff50', fontSize: 10 }}>by {tour.creator}</div>
              </div>
            </div>
            <div style={{ color: '#ffffff70', fontSize: 11, lineHeight: 1.45, marginBottom: 6 }}>
              {tour.description}
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#ffffff50' }}>
              <span>{tour.stopCount} stops</span>
              <span>{tour.playCount} plays</span>
            </div>
          </div>
        ))}

        {tab === 'tours' && !loading && tours.length === 0 && (
          <div style={{ color: '#ffffff40', fontSize: 12, padding: 20, textAlign: 'center', gridColumn: '1 / -1' }}>
            No shared tours yet. Be the first to share one!
          </div>
        )}
      </div>

      {/* Share button */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={tab === 'lenses' ? shareLens : shareTour}
          disabled={sharing}
          style={{
            ...shareBtnStyle,
            opacity: sharing ? 0.6 : 1,
            cursor: sharing ? 'wait' : 'pointer',
          }}
        >
          {sharing
            ? 'Sharing…'
            : tab === 'lenses' ? '🔬 Share My Lens' : '🗺️ Share My Tour'}
        </button>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Styles                                                             */
/* ================================================================== */

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 60,
  right: 16,
  width: 400,
  maxHeight: 'calc(100vh - 100px)',
  background: 'rgba(13, 17, 23, 0.92)',
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(24px)',
  zIndex: 50,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
};

const headerStyle: React.CSSProperties = {
  padding: '14px 16px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const closeBtnStyle: React.CSSProperties = {
  marginLeft: 'auto',
  background: 'none',
  border: 'none',
  color: '#ffffff60',
  fontSize: 16,
  cursor: 'pointer',
  padding: '2px 6px',
};

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  padding: '10px 16px 6px',
};

const tabBtnBase: React.CSSProperties = {
  flex: 1,
  border: 'none',
  borderRadius: 20,
  padding: '6px 0',
  fontSize: 12,
  cursor: 'pointer',
  transition: 'all 0.2s',
};

const gridContainerStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '8px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const cardStyle: React.CSSProperties = {
  borderRadius: 12,
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid rgba(255,255,255,0.06)',
  padding: '12px 14px',
  cursor: 'pointer',
  transition: 'all 0.2s',
  backdropFilter: 'blur(8px)',
};

const shareBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 0',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 10,
  background: 'linear-gradient(135deg, rgba(65,105,225,0.3), rgba(65,105,225,0.15))',
  color: '#ffffffcc',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s',
};
