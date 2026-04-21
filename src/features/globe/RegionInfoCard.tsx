import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatYear } from '../../utils/format';
import { callAI } from '../../ai/callAI';

function formatYearForPrompt(year: number): string {
  const a = Math.abs(year);
  if (a >= 1e9) return `${(a / 1e9).toFixed(1)} billion years ago`;
  if (a >= 1e6) return `${(a / 1e6).toFixed(1)} million years ago`;
  if (a >= 1e4) return `${Math.round(a / 1e3)}K ${year < 0 ? 'BCE' : 'CE'}`;
  if (year < 0) return `${Math.round(a)} BCE`;
  if (year === 0) return '1 CE';
  return `${Math.round(year)} CE`;
}

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
 * region. Shows region info header immediately; AI-generated history is
 * only fetched when the user clicks "Explore history".
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRegionInfo = () => {
    setLoading(true);
    setError(null);

    const yearLabel = formatYearForPrompt(year);
    const locationHint = regionName
      ? `${regionName} (roughly ${lat.toFixed(1)}°, ${lng.toFixed(1)}°)`
      : `the region at ${lat.toFixed(1)}°, ${lng.toFixed(1)}°`;

    const system = `You are a historian. Given a geographic location and a point in time, describe what was happening there. Respond in JSON only, no prose outside the JSON.

Schema:
{
  "placeName": "Concrete name of the place/civilization at that time (e.g. 'Song Dynasty China', 'Roman Britannia', 'Pre-Columbian Cahokia')",
  "summary": "2-4 sentence vivid description of life, politics, culture, or notable events in this place at this time. Use **bold** for 1-2 key phrases.",
  "highlights": ["3-5 short bullet facts"],
  "era": "Short era label, e.g. 'High Middle Ages' or 'Late Cretaceous'"
}

Rules:
- Be accurate and specific. If the year predates humans/civilization in that region, describe the geological, biological, or cosmic state instead.
- If the year is before Earth formed, describe the cosmic context.
- Never invent people or events.
- Keep summary under 450 characters.
- Use web search for corroboration when available.`;

    callAI(
      system,
      [{ role: 'user', content: `What was happening in ${locationHint} around ${yearLabel}?` }],
      { maxTokens: 800, webSearch: true },
    )
      .then(({ text }) => {
        const jsonMatch = text.trim().match(/\{[\s\S]*\}/);
        if (!jsonMatch) { setError('The guide returned an unexpected response'); return; }
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed?.placeName && parsed?.summary) setInfo(parsed as RegionInfo);
          else setError('The guide returned an unexpected response');
        } catch {
          setError('Failed to parse AI response');
        }
      })
      .catch(e => setError(e.message || 'Network error'))
      .finally(() => setLoading(false));
  };

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
            {info?.era || regionName} {'\u00b7'} {yearLabel}
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
            {lat.toFixed(2)}{'\u00b0'}, {lng.toFixed(2)}{'\u00b0'}
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
          {'\u00d7'}
        </button>
      </div>

      {/* Body */}
      <div style={{ marginTop: 10 }}>
        {!info && !loading && !error && (
          <button
            onClick={fetchRegionInfo}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: 'rgba(59,130,246,0.15)',
              border: '1px solid rgba(59,130,246,0.35)',
              color: '#60a5fa',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Explore history of this region
          </button>
        )}

        {loading && (
          <div style={{ fontSize: 12, color: '#ffffff80' }}>
            Asking the guide about this region...
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
