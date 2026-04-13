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
          width: 'min(480px, 92vw)',
          maxHeight: '80vh',
          overflow: 'auto',
          background: 'rgba(10,14,26,0.96)',
          border: '1px solid var(--hairline, rgba(255,255,255,0.08))',
          borderRadius: 2,
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          color: 'var(--paper, #f5f1e8)',
          fontFamily: 'var(--font-display, Fraunces, Georgia, serif)',
          zIndex: 41,
          padding: '24px 28px 22px',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: 'transparent',
            border: '1px solid var(--hairline, rgba(255,255,255,0.12))',
            color: 'var(--paper-mute, #ffffff80)',
            fontSize: 14,
            cursor: 'pointer',
            borderRadius: 2,
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-display, Fraunces, serif)',
          }}
        >
          &times;
        </button>

        {/* Eyebrow */}
        <div style={{
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.18em',
          marginBottom: 10,
          color: 'var(--paper-ghost, #ffffff45)',
          textTransform: 'uppercase',
        }}>
          {era.label} &middot; {scale}
        </div>

        {/* Headline */}
        <h2 style={{
          fontSize: 36,
          fontWeight: 500,
          margin: '0 0 4px',
          lineHeight: 1.05,
          letterSpacing: '-0.005em',
          color: 'var(--paper, #f5f1e8)',
        }}>
          {periodLabel}
        </h2>

        <div style={{
          fontStyle: 'italic',
          fontSize: 14,
          color: 'var(--paper-mute, #ffffff70)',
          marginBottom: 22,
        }}>
          Showing context for {windowLabel}
        </div>

        {/* Nearby events */}
        <div style={{
          marginBottom: 18,
          borderTop: '1px solid var(--hairline, rgba(255,255,255,0.08))',
          paddingTop: 14,
        }}>
          <div style={{
            fontSize: 10,
            fontWeight: 500,
            color: 'var(--paper-ghost, #ffffff45)',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}>
            {nearby.length > 0 ? 'Nearest events' : 'No anchor events in this window'}
          </div>
          {nearby.length === 0 && (
            <div style={{
              fontSize: 14,
              fontStyle: 'italic',
              color: 'var(--paper-mute, #ffffff80)',
              lineHeight: 1.55,
            }}>
              Zoom in to load discovered events for this period, or ask the
              guide what was happening in {periodLabel.toLowerCase()}.
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
                  alignItems: 'baseline',
                  gap: 12,
                  width: '100%',
                  padding: '8px 0',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--hairline, rgba(255,255,255,0.06))',
                  color: 'var(--paper, #f5f1e8)',
                  fontFamily: 'var(--font-display, Fraunces, Georgia, serif)',
                  fontSize: 16,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--paper, #f5f1e8)'; }}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.title}
                </span>
                <span style={{
                  fontStyle: 'italic',
                  fontSize: 12,
                  color: 'var(--paper-ghost, #ffffff50)',
                }}>
                  {deltaLabel}
                </span>
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex',
          gap: 22,
          paddingTop: 14,
          borderTop: '1px solid var(--hairline, rgba(255,255,255,0.08))',
        }}>
          {viewportSpan / 8 >= 1 / 12 && (
            <button
              onClick={() => onZoomIn(year, viewportSpan / 8)}
              style={periodActionBtn}
            >
              Zoom into this period &rarr;
            </button>
          )}
          <button
            onClick={() => onAskGuide(`Tell me what was happening around ${periodLabel}. What were the major events, daily life, and turning points? What's worth knowing about this moment in history?`)}
            style={periodActionBtn}
          >
            Ask the guide
          </button>
        </div>
      </div>
    </>
  );
}

const periodActionBtn: React.CSSProperties = {
  padding: 0,
  background: 'transparent',
  border: 'none',
  color: 'var(--paper-mute, #ffffff90)',
  fontFamily: 'var(--font-display, Fraunces, Georgia, serif)',
  fontStyle: 'italic',
  fontSize: 13,
  letterSpacing: '0.01em',
  cursor: 'pointer',
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
