import type { TourStop } from '../../types';

interface Props {
  stops: TourStop[];
  currentIndex: number;
  playing: boolean;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onClose: () => void;
}

export default function TourOverlay({
  stops,
  currentIndex,
  playing,
  onPause,
  onResume,
  onSkip,
  onClose,
}: Props) {
  const stop = stops[currentIndex];
  if (!stop) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 60,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 600,
      maxWidth: 'calc(100vw - 40px)',
      background: 'rgba(13, 17, 23, 0.95)',
      borderRadius: 16,
      border: '1px solid rgba(255,255,255,0.1)',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
      zIndex: 60,
      overflow: 'hidden',
    }}>
      {/* Progress bar */}
      <div style={{
        height: 3,
        background: 'rgba(255,255,255,0.06)',
      }}>
        <div style={{
          height: '100%',
          width: `${((currentIndex + 1) / stops.length) * 100}%`,
          background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
          transition: 'width 0.5s ease',
        }} />
      </div>

      <div style={{ padding: '18px 24px' }}>
        {/* Tour label */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{ fontSize: 16 }}>🎬</span>
            <span style={{
              color: '#ffffff60',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1,
            }}>
              GUIDED TOUR · {currentIndex + 1}/{stops.length}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff50',
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>

        {/* Narration text */}
        <p style={{
          color: '#ffffffdd',
          fontSize: 15,
          lineHeight: 1.6,
          margin: '0 0 16px',
        }}>
          {stop.text}
        </p>

        {/* Controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <button
            onClick={playing ? onPause : onResume}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              padding: '6px 14px',
              color: '#fff',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {playing ? '⏸ Pause' : '▶ Resume'}
          </button>
          <button
            onClick={onSkip}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              padding: '6px 14px',
              color: '#ffffff80',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            ⏭ Skip
          </button>

          {/* Stop dots */}
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            {stops.map((_, i) => (
              <div
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: i === currentIndex
                    ? '#3b82f6'
                    : i < currentIndex
                    ? '#3b82f660'
                    : 'rgba(255,255,255,0.15)',
                  transition: 'background 0.3s',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
