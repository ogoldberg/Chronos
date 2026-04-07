import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatYear } from '../../utils/format';

interface RegionInfo {
  placeName: string;
  summary: string;
  highlights: string[];
  era: string;
}

interface Props {
  lat: number;
  lng: number;
  regionName: string;
  year: number;
  onClose: () => void;
  onAskGuide?: (question: string) => void;
}

/**
 * Overlay card that appears inside the GlobePanel when the user clicks a
 * region. Fetches /api/region for the clicked lat/lng + current year and
 * renders the structured response. Handles its own loading and error states
 * so the globe remains interactive while the AI is thinking.
 */
export default function RegionInfoCard({
  lat,
  lng,
  regionName,
  year,
  onClose,
  onAskGuide,
}: Props) {
  const [info, setInfo] = useState<RegionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setInfo(null);
    setError(null);

    fetch('/api/region', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, year, regionName }),
    })
      .then(async r => {
        const data = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setError(data?.error || `Server returned ${r.status}`);
        } else if (data?.placeName && data?.summary) {
          setInfo(data as RegionInfo);
        } else {
          setError('The guide returned an unexpected response');
        }
      })
      .catch(e => {
        if (!cancelled) setError(e.message || 'Network error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lng, year, regionName]);

  const yearLabel = formatYear(year);

  return (
    <div
      role="dialog"
      aria-label={`Region info: ${regionName} in ${yearLabel}`}
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 12,
        maxHeight: '62%',
        overflow: 'auto',
        background: 'rgba(10, 14, 22, 0.94)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14,
        backdropFilter: 'blur(20px)',
        padding: '14px 16px 16px',
        zIndex: 5,
        color: '#fff',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 1,
              color: '#60a5fa',
              textTransform: 'uppercase',
              marginBottom: 2,
            }}
          >
            {info?.era || regionName} · {yearLabel}
          </div>
          <h3
            style={{
              fontSize: 16,
              fontWeight: 700,
              margin: 0,
              lineHeight: 1.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {info?.placeName || regionName}
          </h3>
          <div style={{ fontSize: 10, color: '#ffffff60', marginTop: 2, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {lat.toFixed(2)}°, {lng.toFixed(2)}°
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close region info"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#ffffff70',
            fontSize: 18,
            cursor: 'pointer',
            padding: 0,
            width: 24,
            height: 24,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{ marginTop: 10 }}>
        {loading && (
          <div style={{ fontSize: 12, color: '#ffffff80' }}>
            <span className="pulse-dot" /> Asking the guide about this region…
          </div>
        )}

        {error && (
          <div
            style={{
              fontSize: 12,
              color: '#f87171',
              background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.2)',
              padding: '8px 10px',
              borderRadius: 8,
            }}
          >
            Couldn't load region info: {error}
          </div>
        )}

        {info && (
          <>
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.55,
                color: '#ffffffe0',
              }}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ node, ...props }) => (
                    <p {...props} style={{ margin: '0 0 8px' }} />
                  ),
                  strong: ({ node, ...props }) => (
                    <strong {...props} style={{ color: '#fff' }} />
                  ),
                }}
              >
                {info.summary}
              </ReactMarkdown>
            </div>

            {info.highlights && info.highlights.length > 0 && (
              <ul
                style={{
                  margin: '6px 0 0',
                  paddingLeft: 18,
                  fontSize: 12,
                  color: '#ffffffc0',
                  lineHeight: 1.5,
                }}
              >
                {info.highlights.map((h, i) => (
                  <li key={i} style={{ marginBottom: 2 }}>
                    {h}
                  </li>
                ))}
              </ul>
            )}

            {onAskGuide && (
              <button
                onClick={() =>
                  onAskGuide(
                    `Tell me more about ${info.placeName} around ${yearLabel}. What was daily life like? Who were the key people and what shaped this place?`,
                  )
                }
                style={{
                  marginTop: 12,
                  width: '100%',
                  padding: '9px 14px',
                  background: 'rgba(59,130,246,0.15)',
                  border: '1px solid rgba(59,130,246,0.35)',
                  color: '#60a5fa',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Ask the guide to go deeper
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
