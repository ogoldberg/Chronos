/**
 * Lightweight admin dashboard for /api/sources/primary/metrics.
 *
 * Activated by visiting the app with `#sources-metrics` in the URL hash
 * (e.g. http://localhost:5173/#sources-metrics). Intentionally not wired
 * into the regular panel router — it's a diagnostic surface, not a
 * user-facing feature. Polls the metrics endpoint every 5s.
 *
 * The endpoint is unauthenticated and returns only aggregate counts
 * (no PII, no content), matching the server-side documentation on
 * /api/sources/primary/metrics. If the endpoint is ever gated behind
 * ADMIN_KEY, add auth headers here.
 */
import { useEffect, useState } from 'react';

interface MetricsResponse {
  requests: number;
  cacheHits: number;
  aiCalls: number;
  aiCandidates: number;
  aiEmpty: number;
  verifierRuns: number;
  verifierDropped: number;
  verifierUnreachable: number;
  finalSources: number;
  sentinelsBlocked: number;
  derived: {
    verificationSurvivalRate: number | null;
    cacheHitRate: number | null;
    avgCandidatesPerAiCall: number | null;
    avgFinalSourcesPerAiCall: number | null;
  };
}

const POLL_MS = 5000;

function fmtPct(v: number | null): string {
  if (v === null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function fmtNum(v: number | null): string {
  if (v === null) return '—';
  return v.toFixed(2);
}

export default function SourcesMetricsDashboard() {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchMetrics() {
      try {
        const r = await fetch('/api/sources/primary/metrics');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as MetricsResponse;
        if (cancelled) return;
        setData(json);
        setError(null);
        setLastUpdated(new Date());
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    fetchMetrics();
    const id = setInterval(fetchMetrics, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: '#0a0e1a',
    color: '#e8e8e8',
    padding: 32,
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
    fontSize: 13,
    overflow: 'auto',
    zIndex: 10000,
  };
  const cardStyle: React.CSSProperties = {
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 4,
    padding: '14px 18px',
    background: 'rgba(255,255,255,0.02)',
  };
  const labelStyle: React.CSSProperties = {
    color: '#ffffff60',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 4,
  };
  const valueStyle: React.CSSProperties = {
    fontSize: 28,
    fontWeight: 300,
    fontVariantNumeric: 'tabular-nums',
  };

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 400, margin: 0 }}>
          /api/sources/primary metrics
        </h1>
        <span style={{ color: '#ffffff50', fontSize: 11 }}>
          polling every {POLL_MS / 1000}s
          {lastUpdated && ` · last update ${lastUpdated.toLocaleTimeString()}`}
        </span>
      </div>

      {error && (
        <div style={{ ...cardStyle, borderColor: '#ff6060', marginBottom: 16, color: '#ff8080' }}>
          Error fetching metrics: {error}
        </div>
      )}

      {!data && !error && <div style={{ color: '#ffffff60' }}>Loading…</div>}

      {data && (
        <>
          <h2 style={{ fontSize: 13, fontWeight: 400, color: '#ffffff70', marginTop: 0, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Derived rates
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 28 }}>
            <div style={cardStyle}>
              <div style={labelStyle}>Verification survival</div>
              <div style={valueStyle}>{fmtPct(data.derived.verificationSurvivalRate)}</div>
              <div style={{ color: '#ffffff40', fontSize: 10, marginTop: 4 }}>
                candidates surviving Unbrowser checks
              </div>
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>Cache hit rate</div>
              <div style={valueStyle}>{fmtPct(data.derived.cacheHitRate)}</div>
              <div style={{ color: '#ffffff40', fontSize: 10, marginTop: 4 }}>
                requests served without AI call
              </div>
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>Candidates / AI call</div>
              <div style={valueStyle}>{fmtNum(data.derived.avgCandidatesPerAiCall)}</div>
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>Final sources / AI call</div>
              <div style={valueStyle}>{fmtNum(data.derived.avgFinalSourcesPerAiCall)}</div>
            </div>
          </div>

          <h2 style={{ fontSize: 13, fontWeight: 400, color: '#ffffff70', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Raw counters
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {([
              ['requests', 'total requests'],
              ['cacheHits', 'cache hits'],
              ['aiCalls', 'AI calls'],
              ['aiCandidates', 'AI candidates'],
              ['aiEmpty', 'AI empty responses'],
              ['verifierRuns', 'verifier runs'],
              ['verifierDropped', 'verifier dropped'],
              ['verifierUnreachable', 'verifier unreachable'],
              ['finalSources', 'final sources returned'],
              ['sentinelsBlocked', 'sentinels blocked'],
            ] as const).map(([key, label]) => (
              <div key={key} style={cardStyle}>
                <div style={labelStyle}>{label}</div>
                <div style={{ ...valueStyle, fontSize: 22 }}>{data[key]}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
