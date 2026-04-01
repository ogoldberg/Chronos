import { useEffect, useState } from 'react';
import type { TimelineEvent, WikiData, Citation } from '../types';
import { formatYear } from '../utils/format';
import { fetchWikiSummary } from '../services/wikipediaApi';
import { searchWikisource, type SourceDocument } from '../services/wikisourceApi';
import { factCheckEvent, type FactCheckResult } from '../services/factCheck';
import { verifyCitations } from '../services/citationVerifier';
import { EventVoting } from './CommunityHub';

interface Props {
  event: TimelineEvent;
  onClose: () => void;
  onAskGuide: (question: string) => void;
}

export default function EventCard({ event, onClose, onAskGuide }: Props) {
  const [wiki, setWiki] = useState<WikiData | null>(null);
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<SourceDocument[]>([]);
  const [factCheck, setFactCheck] = useState<FactCheckResult | null>(null);
  const [verifiedCitations, setVerifiedCitations] = useState<Citation[]>([]);

  useEffect(() => {
    if (event.wiki) {
      setLoading(true);
      fetchWikiSummary(event.wiki)
        .then(data => { setWiki(data); setLoading(false); })
        .catch(() => setLoading(false));
    }
    verifyCitations(event.citations, event.wiki)
      .then(setVerifiedCitations)
      .catch(() => {});
    if (event.source === 'discovered') {
      factCheckEvent(event.title, event.year, event.description)
        .then(setFactCheck)
        .catch(() => {});
    }
    if (event.year > -3000) {
      searchWikisource(event.title)
        .then(setSources)
        .catch(() => {});
    }
  }, [event.wiki, event.title, event.year, event.source, event.description, event.citations]);

  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(10, 13, 20, 0.96)',
      border: `1px solid ${event.color}30`,
      borderRadius: 18,
      padding: 0,
      maxWidth: 480,
      width: '90vw',
      maxHeight: '80vh',
      overflow: 'hidden',
      overflowY: 'auto',
      zIndex: 100,
      backdropFilter: 'blur(24px)',
      boxShadow: `0 0 60px ${event.color}15, 0 24px 80px rgba(0,0,0,0.6)`,
      animation: 'modalSlideIn 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    }}>
      {/* Header image with shimmer loading state */}
      {(event.imageUrl || wiki?.thumb) && (
        <div style={{
          width: '100%',
          height: 200,
          overflow: 'hidden',
          position: 'relative',
          background: '#0d1117',
        }}>
          {/* Shimmer placeholder while image loads */}
          {!imgLoaded && (
            <div className="image-loading" style={{
              position: 'absolute',
              inset: 0,
            }} />
          )}
          <img
            src={event.imageUrl || wiki?.thumb}
            alt={event.title}
            onLoad={() => setImgLoaded(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: imgLoaded ? 1 : 0,
              transition: 'opacity 0.4s ease',
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
        {/* Fact-check badge for discovered events */}
        {factCheck && (
          <div style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 10,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.5,
            marginBottom: 12,
            marginLeft: 6,
            background: factCheck.verified
              ? factCheck.confidence >= 0.8 ? '#22c55e20' : '#eab30820'
              : '#ef444420',
            color: factCheck.verified
              ? factCheck.confidence >= 0.8 ? '#22c55e' : '#eab308'
              : '#ef4444',
            border: `1px solid ${factCheck.verified
              ? factCheck.confidence >= 0.8 ? '#22c55e40' : '#eab30840'
              : '#ef444440'}`,
          }}>
            {factCheck.verified
              ? factCheck.confidence >= 0.8 ? '✓ VERIFIED' : '~ LIKELY'
              : '? UNVERIFIED'}
          </div>
        )}

        {/* Description */}
        <p style={{ color: '#ffffffcc', lineHeight: 1.6, margin: '0 0 16px', fontSize: 14 }}>
          {event.description}
        </p>

        {/* Fact-check details */}
        {factCheck?.details && (
          <div style={{
            fontSize: 11,
            color: factCheck.verified ? '#22c55e99' : '#ef444499',
            marginBottom: 12,
            fontStyle: 'italic',
          }}>
            {factCheck.details}
            {factCheck.wikidataId && (
              <a
                href={`https://www.wikidata.org/wiki/${factCheck.wikidataId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#3b82f6', marginLeft: 6, textDecoration: 'none' }}
              >
                Wikidata ↗
              </a>
            )}
          </div>
        )}

        {/* Confidence + Speculation notice */}
        {event.confidence === 'speculative' && (
          <div style={{
            background: 'rgba(234, 179, 8, 0.08)',
            border: '1px solid rgba(234, 179, 8, 0.2)',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 12,
            fontSize: 12,
            color: '#eab308cc',
            lineHeight: 1.5,
          }}>
            ⚠️ <strong>Speculative:</strong> {event.speculativeNote || 'This event involves scholarly debate or uncertain dating.'}
          </div>
        )}

        {/* Citations — verified with real URLs */}
        {verifiedCitations.length > 0 && (
          <div style={{
            marginBottom: 12,
            fontSize: 11,
            color: '#ffffff50',
          }}>
            <span style={{ fontWeight: 600, letterSpacing: 0.5 }}>Sources: </span>
            {verifiedCitations.map((cite, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                {cite.url ? (
                  <a href={cite.url} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f680', textDecoration: 'none' }}>
                    {cite.title || cite.source}
                  </a>
                ) : (
                  <span>{cite.title || cite.source}</span>
                )}
              </span>
            ))}
          </div>
        )}

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

        {/* Video — integrated with visual context */}
        {event.videoUrl && (
          <div style={{
            marginBottom: 16,
            borderRadius: 12,
            overflow: 'hidden',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
            border: '1px solid rgba(255,255,255,0.04)',
            transition: 'border-color 0.2s',
          }}>
            <a
              href={event.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '14px 16px',
                color: '#ffffffdd',
                textDecoration: 'none',
                fontSize: 13,
              }}
            >
              <span style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: `${event.color}20`,
                border: `1px solid ${event.color}40`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                flexShrink: 0,
              }}>▶</span>
              <div>
                <div style={{ fontWeight: 500 }}>Watch video</div>
                {event.mediaCaption && (
                  <div style={{ color: '#ffffff50', fontSize: 11, marginTop: 2 }}>{event.mediaCaption}</div>
                )}
              </div>
              <span style={{ marginLeft: 'auto', color: '#ffffff30', fontSize: 11 }}>↗</span>
            </a>
          </div>
        )}

        {/* Audio — styled player */}
        {event.audioUrl && (
          <div style={{
            marginBottom: 16,
            borderRadius: 12,
            overflow: 'hidden',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
            border: '1px solid rgba(255,255,255,0.04)',
            padding: '12px 16px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 10,
            }}>
              <span style={{ fontSize: 14 }}>🎧</span>
              <span style={{ fontSize: 10, color: '#ffffff40', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
                Audio
              </span>
            </div>
            <audio
              controls
              src={event.audioUrl}
              style={{
                width: '100%',
                height: 36,
                borderRadius: 8,
                filter: 'invert(1) hue-rotate(180deg) brightness(0.85)',
              }}
            />
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
            <div style={{ fontSize: 11, color: '#ffffff45', fontWeight: 600, letterSpacing: 0.8, marginBottom: 8 }}>
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

        {/* Primary Sources */}
        {sources.length > 0 && (
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 10,
            padding: 14,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 11, color: '#ffffff45', fontWeight: 600, letterSpacing: 0.8, marginBottom: 8 }}>
              PRIMARY SOURCES
            </div>
            {sources.slice(0, 3).map((src, i) => (
              <a
                key={i}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  padding: '6px 0',
                  borderBottom: i < Math.min(sources.length, 3) - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  color: '#ffffffcc',
                  textDecoration: 'none',
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 500 }}>📜 {src.title}</div>
                {src.extract && (
                  <div style={{ color: '#ffffff60', fontSize: 11, marginTop: 2, lineHeight: 1.4 }}>
                    {src.extract.slice(0, 100)}...
                  </div>
                )}
              </a>
            ))}
          </div>
        )}

        {/* Event Voting */}
        {event.source === 'discovered' && (
          <div style={{ marginBottom: 12 }}>
            <EventVoting eventId={event.id} />
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
          <button
            onClick={() => {
              const url = window.location.href;
              navigator.clipboard.writeText(url).then(() => {
                const btn = document.activeElement as HTMLButtonElement;
                if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => { btn.textContent = '🔗 Share'; }, 1500); }
              });
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '8px 14px',
              background: 'rgba(255,255,255,0.08)',
              borderRadius: 8,
              color: '#ffffffaa',
              fontSize: 12,
              border: '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer',
            }}
          >
            🔗 Share
          </button>
        </div>
      </div>
    </div>
  );
}
