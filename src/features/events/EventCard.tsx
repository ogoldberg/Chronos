import { useEffect, useState, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import type { TimelineEvent, WikiData, Citation } from '../../types';
import { formatYear } from '../../utils/format';
import { fetchWikiSummary } from '../../services/wikipediaApi';
import { fetchPrimarySources } from '../../services/primarySources';
import type { PrimarySource } from '../../types';
import { factCheckEvent, type FactCheckResult } from '../../services/factCheck';
import { verifyCitations } from '../../services/citationVerifier';
import EventVoting from './EventVoting';

const EventGraphModal = lazy(() => import('../graph/EventGraphModal'));

interface Props {
  event: TimelineEvent;
  onClose: () => void;
  onAskGuide: (question: string) => void;
  onNavigate?: (year: number, span: number) => void;
}

/** Shared shape for the trio of action buttons at the bottom of the card. */
const EVENT_ACTION_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: 0,
  background: 'transparent',
  border: 'none',
  color: 'var(--paper-mute, #ffffff90)',
  textDecoration: 'none',
  fontFamily: 'var(--font-display, Fraunces, Georgia, serif)',
  fontStyle: 'italic',
  fontSize: 13,
  letterSpacing: '0.01em',
  cursor: 'pointer',
};

interface RelatedEvent {
  title: string;
  year?: number;
  relation: string;
  description?: string;
  wiki?: string;
}

export default function EventCard({ event, onClose, onAskGuide, onNavigate }: Props) {
  const [wiki, setWiki] = useState<WikiData | null>(null);
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<PrimarySource[]>([]);
  const [factCheck, setFactCheck] = useState<FactCheckResult | null>(null);
  const [verifiedCitations, setVerifiedCitations] = useState<Citation[]>([]);
  const [relatedEvents, setRelatedEvents] = useState<RelatedEvent[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  // Wikipedia section expanded state. When collapsed we clamp the extract
  // at ~120px with a fade mask; when expanded the full article text flows
  // inline and the card itself scrolls to accommodate it.
  const [wikiExpanded, setWikiExpanded] = useState(false);

  // Wikipedia summary + citation verification (non-AI, free)
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
  }, [event.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // AI-powered features — only fetched on user request
  const loadPrimarySources = () => {
    if (sources.length > 0) return;
    fetchPrimarySources(event)
      .then(setSources)
      .catch(() => setSources([]));
  };

  const loadFactCheck = () => {
    if (factCheck) return;
    factCheckEvent(event.title, event.year, event.description)
      .then(setFactCheck)
      .catch(() => {});
  };

  // Wikidata graph: discover related events (free, no AI)
  const loadRelatedEvents = () => {
    if (relatedEvents.length > 0 || !event.wiki) return;
    setRelatedLoading(true);
    fetch('/api/events/related', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wikiTitle: event.wiki }),
    })
      .then(r => r.json())
      .then(data => setRelatedEvents(data.related || []))
      .catch(() => {})
      .finally(() => setRelatedLoading(false));
  };

  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(10, 14, 26, 0.96)',
      border: '1px solid var(--hairline, rgba(255,255,255,0.08))',
      borderRadius: 2,
      padding: 0,
      maxWidth: 520,
      width: '90vw',
      maxHeight: '82vh',
      overflow: 'hidden',
      overflowY: 'auto',
      zIndex: 100,
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      animation: 'modalSlideIn 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      fontFamily: 'var(--font-display, Fraunces, Georgia, serif)',
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

        {/* Source eyebrow */}
        <div style={{
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.18em',
          marginBottom: 10,
          color: 'var(--paper-ghost, #ffffff45)',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-display, Fraunces, serif)',
        }}>
          {event.source === 'anchor' ? 'Curated' : 'AI + Web Search'}
        </div>

        {/* Title */}
        <h2 style={{
          margin: '0 0 4px',
          color: 'var(--paper, #f5f1e8)',
          fontSize: 30,
          fontFamily: 'var(--font-display, Fraunces, Georgia, serif)',
          fontWeight: 500,
          letterSpacing: '-0.005em',
          lineHeight: 1.1,
        }}>
          {event.title}
        </h2>

        {/* Date subtitle */}
        <div style={{
          fontFamily: 'var(--font-display, Fraunces, Georgia, serif)',
          fontStyle: 'italic',
          color: 'var(--paper-mute, #ffffff70)',
          fontSize: 14,
          marginBottom: 16,
        }}>
          {event.timestamp
            ? new Date(event.timestamp).toLocaleDateString('en-US', {
                year: 'numeric',
                month: event.precision && ['month','week','day','hour','minute'].includes(event.precision) ? 'long' : undefined,
                day: event.precision && ['day','hour','minute'].includes(event.precision) ? 'numeric' : undefined,
              })
            : formatYear(event.year)
          }
          {event.precision && event.precision !== 'year' && (
            <span style={{ color: 'var(--paper-ghost, #ffffff40)', fontSize: 11, marginLeft: 8, fontStyle: 'normal' }}>
              ({event.precision} precision)
            </span>
          )}
        </div>
        {/* Fact-check badge for discovered events — loaded on demand */}
        {event.source === 'discovered' && !factCheck && (
          <button
            onClick={loadFactCheck}
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 10,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 0.5,
              marginBottom: 12,
              marginLeft: 6,
              background: 'rgba(255,255,255,0.06)',
              color: '#ffffff70',
              border: '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer',
            }}
          >
            Verify this event
          </button>
        )}
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
            background: 'transparent',
            borderTop: '1px solid var(--hairline, rgba(255,255,255,0.08))',
            borderBottom: '1px solid var(--hairline, rgba(255,255,255,0.08))',
            padding: '14px 0',
            marginBottom: 16,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}>
              <div style={{
                fontSize: 10,
                color: 'var(--paper-ghost, #ffffff45)',
                fontWeight: 500,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                fontFamily: 'var(--font-display, Fraunces, serif)',
              }}>
                Wikipedia
              </div>
              <button
                onClick={() => setWikiExpanded(v => !v)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--paper-mute, #ffffff80)',
                  fontSize: 11,
                  fontStyle: 'italic',
                  padding: '2px 0',
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                  fontFamily: 'var(--font-display, Fraunces, serif)',
                }}
              >
                {wikiExpanded ? 'collapse \u2191' : 'read more \u2193'}
              </button>
            </div>
            {/*
              Collapsed: clamped height with a gradient fade so users can
              tell there's more. Clicking the collapsed text also expands it
              (not just the explicit button), making it feel like a single
              accordion target.

              Expanded: full article text flows inline. We cap at 60vh and
              scroll internally so very long extracts don't push the rest of
              the event card off-screen.
            */}
            <div
              onClick={() => { if (!wikiExpanded) setWikiExpanded(true); }}
              style={{
                cursor: wikiExpanded ? 'default' : 'pointer',
              }}
            >
              <p style={{
                color: '#ffffffcc',
                fontSize: 13,
                lineHeight: 1.55,
                margin: 0,
                maxHeight: wikiExpanded ? '60vh' : 120,
                overflowY: wikiExpanded ? 'auto' : 'hidden',
                overflowX: 'hidden',
                whiteSpace: 'pre-wrap',
                maskImage: wikiExpanded
                  ? 'none'
                  : 'linear-gradient(to bottom, black 70%, transparent 100%)',
                WebkitMaskImage: wikiExpanded
                  ? 'none'
                  : 'linear-gradient(to bottom, black 70%, transparent 100%)',
                transition: 'max-height 0.25s ease',
              }}>
                {wiki.extract}
              </p>
            </div>
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

        {/* Primary Sources — opt-in AI discovery */}
        {sources.length === 0 && (
          <button
            onClick={loadPrimarySources}
            style={{
              ...EVENT_ACTION_STYLE,
              marginBottom: 12,
              padding: '6px 12px',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            Find primary sources
          </button>
        )}
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
                <div style={{ fontWeight: 500 }}>
                  📜 {src.title}
                  {src.year !== undefined && (
                    <span style={{ color: '#ffffff45', fontWeight: 400, marginLeft: 6 }}>
                      ({src.year < 0 ? `${Math.abs(src.year)} BCE` : src.year})
                    </span>
                  )}
                </div>
                {(src.author || src.type) && (
                  <div style={{ color: '#ffffff50', fontSize: 10, marginTop: 2 }}>
                    {[src.author, src.type].filter(Boolean).join(' · ')}
                  </div>
                )}
                {src.relevance && (
                  <div style={{ color: '#ffffff60', fontSize: 11, marginTop: 2, lineHeight: 1.4, fontStyle: 'italic' }}>
                    {src.relevance}
                  </div>
                )}
                {/* Verification provenance: shown only when the
                    extracted page title differs from the AI-claimed
                    title in a way worth surfacing. If the strings
                    match (or one is a prefix of the other), we skip
                    it — redundant noise. When they differ, the
                    extracted title tells the user what Unbrowser
                    actually saw on the page, which is useful for
                    citation verification. */}
                {src.extractedTitle
                  && src.extractedTitle.toLowerCase() !== src.title.toLowerCase()
                  && !src.extractedTitle.toLowerCase().startsWith(src.title.toLowerCase())
                  && (
                    <div style={{ color: '#ffffff40', fontSize: 10, marginTop: 2, fontFamily: 'monospace' }}>
                      ✓ verified as: {src.extractedTitle.slice(0, 80)}
                      {src.extractedTitle.length > 80 ? '…' : ''}
                    </div>
                  )}
              </a>
            ))}
          </div>
        )}

        {/* Related Events — Wikidata graph (free, no AI).
            Discovery button only shows before loading; the graph button stays
            visible whether or not related events have been listed yet so users
            can always reach the visual graph after seeing the textual list. */}
        {event.wiki && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {relatedEvents.length === 0 && !relatedLoading && (
              <button
                onClick={loadRelatedEvents}
                style={{
                  ...EVENT_ACTION_STYLE,
                  padding: '6px 12px',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                Discover related events
              </button>
            )}
            {onNavigate && (
              <button
                onClick={() => setShowGraph(true)}
                style={{
                  ...EVENT_ACTION_STYLE,
                  padding: '6px 12px',
                  background: 'rgba(96,165,250,0.08)',
                  borderRadius: 8,
                  border: '1px solid rgba(96,165,250,0.2)',
                  color: '#60a5fa',
                }}
              >
                View connection graph
              </button>
            )}
          </div>
        )}
        {relatedLoading && (
          <div style={{ fontSize: 12, color: '#ffffff50', marginBottom: 12 }}>
            Exploring connections...
          </div>
        )}
        {relatedEvents.length > 0 && (
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 10,
            padding: 14,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 11, color: '#ffffff45', fontWeight: 600, letterSpacing: 0.8, marginBottom: 8 }}>
              CONNECTED EVENTS
            </div>
            {relatedEvents.slice(0, 8).map((rel, i) => (
              <div
                key={i}
                style={{
                  padding: '6px 0',
                  borderBottom: i < Math.min(relatedEvents.length, 8) - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{
                    fontSize: 9,
                    color: rel.relation === 'Caused by' ? '#f59e0b' :
                           rel.relation === 'Led to' ? '#22c55e' :
                           rel.relation === 'Followed by' ? '#22c55e' :
                           '#60a5fa',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    flexShrink: 0,
                  }}>
                    {rel.relation}
                  </span>
                </div>
                <div style={{ color: '#ffffffcc', fontSize: 12, fontWeight: 500, marginTop: 2 }}>
                  {rel.title}
                  {rel.year !== undefined && (
                    <span style={{ color: '#ffffff50', fontWeight: 400, marginLeft: 6, fontFamily: 'monospace', fontSize: 11 }}>
                      {rel.year < 0 ? `${Math.abs(rel.year)} BCE` : rel.year}
                    </span>
                  )}
                </div>
                {rel.description && (
                  <div style={{ color: '#ffffff60', fontSize: 11, marginTop: 2, lineHeight: 1.4, fontStyle: 'italic' }}>
                    {rel.description.slice(0, 120)}{rel.description.length > 120 ? '...' : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Event Voting */}
        {event.source === 'discovered' && (
          <div style={{ marginBottom: 12 }}>
            <EventVoting eventId={event.id} />
          </div>
        )}

        {/* Actions — flat editorial buttons, hairline borders, serif text */}
        <div style={{
          display: 'flex',
          gap: 0,
          marginTop: 8,
          borderTop: '1px solid var(--hairline, rgba(255,255,255,0.08))',
          paddingTop: 14,
        }}>
          {wiki?.url && (
            <a
              href={wiki.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                ...EVENT_ACTION_STYLE,
                marginRight: 14,
              }}
            >
              Read full article &rarr;
            </a>
          )}
          <button
            onClick={() => onAskGuide(`Tell me more about ${event.title} (${formatYear(event.year)}). What made this significant and how does it connect to other events?`)}
            style={{ ...EVENT_ACTION_STYLE, marginRight: 14, background: 'transparent' }}
          >
            Ask the guide
          </button>
          <button
            onClick={() => {
              const url = window.location.href;
              navigator.clipboard.writeText(url).then(() => {
                const btn = document.activeElement as HTMLButtonElement;
                if (btn) {
                  const orig = btn.textContent;
                  btn.textContent = 'Copied';
                  setTimeout(() => { btn.textContent = orig; }, 1500);
                }
              });
            }}
            style={{ ...EVENT_ACTION_STYLE, background: 'transparent', marginLeft: 'auto' }}
          >
            Share
          </button>
        </div>
      </div>

      {/* Wikidata Graph Modal — portalled to body for full-screen overlay */}
      {showGraph && event.wiki && onNavigate && createPortal(
        <Suspense fallback={null}>
          <EventGraphModal
            eventTitle={event.title}
            eventYear={event.year}
            eventWiki={event.wiki}
            onNavigate={onNavigate}
            onClose={() => setShowGraph(false)}
          />
        </Suspense>,
        document.body,
      )}
    </div>
  );
}
