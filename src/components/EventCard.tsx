import { useEffect, useState } from 'react';
import type { TimelineEvent, WikiData } from '../types';
import { formatYear } from '../utils/format';
import { fetchWikiSummary } from '../services/wikipediaApi';

interface Props {
  event: TimelineEvent;
  onClose: () => void;
  onAskGuide: (question: string) => void;
}

export default function EventCard({ event, onClose, onAskGuide }: Props) {
  const [wiki, setWiki] = useState<WikiData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (event.wiki) {
      setLoading(true);
      fetchWikiSummary(event.wiki).then(data => {
        setWiki(data);
        setLoading(false);
      });
    }
  }, [event.wiki]);

  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(13, 17, 23, 0.95)',
      border: `1px solid ${event.color}40`,
      borderRadius: 16,
      padding: 0,
      maxWidth: 480,
      width: '90vw',
      maxHeight: '80vh',
      overflow: 'hidden',
      zIndex: 100,
      backdropFilter: 'blur(20px)',
      boxShadow: `0 0 40px ${event.color}20, 0 20px 60px rgba(0,0,0,0.5)`,
    }}>
      {/* Header image — prefer event's own image, fall back to Wikipedia */}
      {(event.imageUrl || wiki?.thumb) && (
        <div style={{
          width: '100%',
          height: 180,
          overflow: 'hidden',
          position: 'relative',
        }}>
          <img
            src={event.imageUrl || wiki?.thumb}
            alt={event.title}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 60,
            background: 'linear-gradient(transparent, rgba(13,17,23,0.95))',
          }} />
        </div>
      )}

      {/* Content */}
      <div style={{ padding: '20px 24px' }}>
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'rgba(0,0,0,0.5)',
            border: 'none',
            color: '#fff',
            fontSize: 18,
            cursor: 'pointer',
            borderRadius: '50%',
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(10px)',
          }}
        >
          ✕
        </button>

        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 28 }}>{event.emoji}</span>
          <div>
            <h2 style={{ margin: 0, color: '#fff', fontSize: 20 }}>{event.title}</h2>
            <span style={{ color: event.color, fontSize: 13, fontFamily: 'monospace' }}>
              {event.timestamp
                ? new Date(event.timestamp).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: event.precision && ['month','week','day','hour','minute'].includes(event.precision) ? 'long' : undefined,
                    day: event.precision && ['day','hour','minute'].includes(event.precision) ? 'numeric' : undefined,
                  })
                : formatYear(event.year)
              }
            </span>
            {event.precision && event.precision !== 'year' && (
              <span style={{ color: '#ffffff40', fontSize: 10, marginLeft: 6 }}>
                ({event.precision} precision)
              </span>
            )}
          </div>
        </div>

        {/* Source badge */}
        <div style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: 10,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 0.5,
          marginBottom: 12,
          background: event.source === 'anchor' ? '#daa52030' : '#00bfff30',
          color: event.source === 'anchor' ? '#daa520' : '#00bfff',
          border: `1px solid ${event.source === 'anchor' ? '#daa52040' : '#00bfff40'}`,
        }}>
          {event.source === 'anchor' ? 'CURATED' : 'AI + WEB SEARCH'}
        </div>

        {/* Description */}
        <p style={{ color: '#ffffffcc', lineHeight: 1.6, margin: '0 0 16px', fontSize: 14 }}>
          {event.description}
        </p>

        {/* Wikipedia content */}
        {loading && (
          <div style={{ color: '#ffffff60', fontSize: 13 }}>Loading Wikipedia data...</div>
        )}
        {wiki?.extract && (
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 10,
            padding: 14,
            marginBottom: 16,
          }}>
            <div style={{
              fontSize: 10,
              color: '#ffffff50',
              fontWeight: 600,
              letterSpacing: 1,
              marginBottom: 8,
            }}>
              WIKIPEDIA
            </div>
            <p style={{
              color: '#ffffffaa',
              fontSize: 13,
              lineHeight: 1.5,
              margin: 0,
              maxHeight: 120,
              overflow: 'hidden',
              maskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)',
            }}>
              {wiki.extract}
            </p>
          </div>
        )}

        {/* Video embed */}
        {event.videoUrl && (
          <div style={{
            marginBottom: 16,
            borderRadius: 10,
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.04)',
          }}>
            <div style={{ fontSize: 10, color: '#ffffff50', fontWeight: 600, letterSpacing: 1, padding: '10px 14px 0' }}>
              VIDEO
            </div>
            <a
              href={event.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                color: '#ffffffcc',
                textDecoration: 'none',
                fontSize: 13,
              }}
            >
              ▶️ Watch video
              {event.mediaCaption && <span style={{ color: '#ffffff60', fontSize: 11 }}>— {event.mediaCaption}</span>}
            </a>
          </div>
        )}

        {/* Audio */}
        {event.audioUrl && (
          <div style={{
            marginBottom: 16,
            borderRadius: 10,
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.04)',
            padding: 14,
          }}>
            <div style={{ fontSize: 10, color: '#ffffff50', fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>
              AUDIO
            </div>
            <audio controls src={event.audioUrl} style={{ width: '100%', height: 32 }} />
          </div>
        )}

        {/* Media credit */}
        {event.mediaCredit && (
          <div style={{ color: '#ffffff30', fontSize: 10, marginBottom: 12, fontStyle: 'italic' }}>
            {event.mediaCredit}
          </div>
        )}

        {/* Connections */}
        {event.connections && event.connections.length > 0 && (
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 10,
            padding: 14,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 10, color: '#ffffff50', fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>
              CONNECTIONS
            </div>
            {event.connections.map((conn, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 0',
                fontSize: 12,
                color: '#ffffffcc',
              }}>
                <span style={{
                  color: conn.type === 'caused' || conn.type === 'led_to' ? '#ff6b6b'
                    : conn.type === 'influenced' ? '#ffd700' : '#87ceeb',
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  minWidth: 60,
                }}>
                  {conn.label || conn.type}
                </span>
                <span>→</span>
                <span>{conn.targetTitle || conn.targetId}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {wiki?.url && (
            <a
              href={wiki.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '8px 14px',
                background: 'rgba(255,255,255,0.08)',
                borderRadius: 8,
                color: '#ffffffcc',
                textDecoration: 'none',
                fontSize: 12,
                border: '1px solid rgba(255,255,255,0.1)',
                cursor: 'pointer',
              }}
            >
              📖 Read Full Article ↗
            </a>
          )}
          <button
            onClick={() => onAskGuide(`Tell me more about ${event.title} (${formatYear(event.year)}). What made this significant and how does it connect to other events?`)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '8px 14px',
              background: `${event.color}20`,
              borderRadius: 8,
              color: event.color,
              fontSize: 12,
              border: `1px solid ${event.color}40`,
              cursor: 'pointer',
            }}
          >
            💬 Ask Guide
          </button>
        </div>
      </div>
    </div>
  );
}
