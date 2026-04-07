import { useMemo } from 'react';
import type { TimelineEvent } from '../../types';
import { formatYear, scaleLabel } from '../../utils/format';
import { getEra } from '../../data/eras';

interface Props {
  /** Year the user clicked. */
  year: number;
  /** Current viewport span — used to derive a sensible "neighborhood" window. */
  viewportSpan: number;
  /** All known events (anchors + dynamic). The card filters these by proximity. */
  allEvents: TimelineEvent[];
  onClose: () => void;
  onZoomIn: (year: number, span: number) => void;
  onSelectEvent: (ev: TimelineEvent) => void;
  onAskGuide: (question: string) => void;
}

/**
 * A floating card that appears when the user clicks an empty point on the
 * timeline. It shows what era they're looking at, the nearest known events,
 * and offers ways to dig deeper (zoom in, ask the AI guide, jump to a specific
 * event). The "granularity" of the period — i.e. how wide the neighborhood is
 * around the clicked year — is derived from the current viewport span so that
 * a click at the cosmic scale samples millions of years while a click in the
 * 20th century samples a few decades.
 */
export default function PeriodCard({
  year,
  viewportSpan,
  allEvents,
  onClose,
  onZoomIn,
  onSelectEvent,
  onAskGuide,
}: Props) {
  // Period window: ±10% of the visible span around the clicked year. Wide
  // enough to surface context, narrow enough that the user feels they're
  // zooming into the moment they actually clicked.
  const windowHalf = viewportSpan * 0.1;
  const era = getEra(year);
  const scale = scaleLabel(viewportSpan);

  const nearby = useMemo(() => {
    return allEvents
      .filter(e => Math.abs(e.year - year) <= windowHalf)
      .sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year))
      .slice(0, 8);
  }, [allEvents, year, windowHalf]);

  const periodLabel = formatYear(year);
  const windowLabel = formatPeriodWindow(year, windowHalf);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(2px)',
          zIndex: 40,
        }}
      />
      <div
        role="dialog"
        aria-label={`Period card for ${periodLabel}`}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(440px, 92vw)',
          maxHeight: '78vh',
          overflow: 'auto',
          background: 'rgba(13,17,23,0.96)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 18,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          backdropFilter: 'blur(20px)',
          color: '#fff',
          zIndex: 41,
          padding: '20px 22px 18px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{
            width: 8,
            height: 56,
            borderRadius: 4,
            background: era.accent,
            flexShrink: 0,
            marginTop: 2,
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1.2,
              color: era.accent,
              textTransform: 'uppercase',
              marginBottom: 4,
            }}>
              {era.label} · {scale}
            </div>
            <h2 style={{
              fontSize: 22,
              fontWeight: 700,
              margin: 0,
              lineHeight: 1.2,
            }}>
              {periodLabel}
            </h2>
            <div style={{ fontSize: 12, color: '#ffffff70', marginTop: 4 }}>
              Showing context for {windowLabel}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff70',
              fontSize: 22,
              cursor: 'pointer',
              padding: 0,
              width: 28,
              height: 28,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Nearby events */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#ffffff60',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            {nearby.length > 0 ? 'Nearest events' : 'No anchor events in this window'}
          </div>
          {nearby.length === 0 && (
            <div style={{ fontSize: 13, color: '#ffffff80', lineHeight: 1.5 }}>
              Zoom in to load discovered events for this period, or ask the guide
              what was happening in {periodLabel.toLowerCase()}.
            </div>
          )}
          {nearby.map(ev => {
            const delta = ev.year - year;
            const deltaLabel = formatDelta(delta);
            return (
              <button
                key={ev.id}
                onClick={() => onSelectEvent(ev)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10,
                  marginBottom: 6,
                  color: '#fff',
                  fontSize: 13,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              >
                <span style={{ fontSize: 18 }}>{ev.emoji}</span>
                <span style={{ flex: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.title}
                </span>
                <span style={{ fontSize: 11, color: '#ffffff60', fontFamily: 'monospace' }}>
                  {deltaLabel}
                </span>
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={() => onZoomIn(year, viewportSpan / 8)}
            style={primaryBtn}
            onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.15)'; }}
            onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
          >
            Zoom into this period
          </button>
          <button
            onClick={() => onAskGuide(`Tell me what was happening around ${periodLabel}. What were the major events, daily life, and turning points? What's worth knowing about this moment in history?`)}
            style={secondaryBtn}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
          >
            Ask the guide about {periodLabel}
          </button>
        </div>
      </div>
    </>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: '11px 16px',
  background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
  border: 'none',
  borderRadius: 10,
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'filter 0.15s',
};

const secondaryBtn: React.CSSProperties = {
  padding: '11px 16px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  color: '#ffffffcc',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'background 0.15s',
};

/** Format the half-window into a friendly "the surrounding X" string. */
function formatPeriodWindow(year: number, half: number): string {
  const lo = year - half;
  const hi = year + half;
  // For very narrow windows just return the year itself.
  if (half < 1) return formatYear(year);
  return `${formatYear(lo)} – ${formatYear(hi)}`;
}

/** Format a year-delta into a compact "+200y" / "−1.2M" / "now" label. */
function formatDelta(delta: number): string {
  if (delta === 0) return 'here';
  const a = Math.abs(delta);
  const sign = delta < 0 ? '−' : '+';
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(1)}K`;
  if (a >= 1) return `${sign}${Math.round(a)}y`;
  // sub-year
  const months = Math.round(a * 12);
  return `${sign}${months}mo`;
}
