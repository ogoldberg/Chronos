import { useState, useRef, useEffect, useCallback } from 'react';
import {
  WORLD_POPULATION,
  TEMPERATURE_ANOMALY,
  CO2_CONCENTRATION,
  GDP_ESTIMATES,
  POPULATION_BY_REGION,
  GDP_BY_CIVILIZATION,
  TRADE_ROUTE_VOLUMES,
  type DataPoint,
  type RegionDataSeries,
  type CivGDPSeries,
  type TradeRouteSeries,
} from '../../data/climateData';
import { REGION_LANES } from '../../data/regions';
import { useTimelineStore } from '../../stores/timelineStore';
import { getVisibleRange } from '../../canvas/viewport';

/* ------------------------------------------------------------------ */
/*  Overlay config                                                     */
/* ------------------------------------------------------------------ */

interface OverlayConfig {
  key: string;
  label: string;
  unit: string;
  color: string;
  data: DataPoint[];
  logScale: boolean;
}

const OVERLAYS: OverlayConfig[] = [
  { key: 'population', label: 'World Population', unit: 'M', color: '#22c55e', data: WORLD_POPULATION, logScale: true },
  { key: 'temperature', label: 'Temp Anomaly', unit: '\u00b0C', color: '#ef4444', data: TEMPERATURE_ANOMALY, logScale: false },
  { key: 'co2', label: 'CO\u2082 (ppm)', unit: 'ppm', color: '#f97316', data: CO2_CONCENTRATION, logScale: false },
  { key: 'gdp', label: 'Global GDP', unit: 'B$', color: '#3b82f6', data: GDP_ESTIMATES, logScale: true },
];

/* ------------------------------------------------------------------ */
/*  Helper: interpolate data for a given year range                    */
/* ------------------------------------------------------------------ */

function interpolate(data: DataPoint[], year: number): number | null {
  if (year < data[0].year || year > data[data.length - 1].year) return null;
  for (let i = 0; i < data.length - 1; i++) {
    if (year >= data[i].year && year <= data[i + 1].year) {
      const t = (year - data[i].year) / (data[i + 1].year - data[i].year);
      return data[i].value + t * (data[i + 1].value - data[i].value);
    }
  }
  return data[data.length - 1].value;
}

function formatValue(val: number, unit: string, logScale: boolean): string {
  if (logScale && val >= 1000) return `${(val / 1000).toFixed(1)}B`;
  if (logScale && val >= 1) return `${val.toFixed(0)}M`;
  if (unit === '\u00b0C') return `${val >= 0 ? '+' : ''}${val.toFixed(1)}\u00b0C`;
  if (unit === 'ppm') return `${val.toFixed(0)} ppm`;
  if (unit === 'B$' && val >= 1000) return `$${(val / 1000).toFixed(1)}T`;
  if (unit === 'B$') return `$${val.toFixed(0)}B`;
  return `${val.toFixed(1)} ${unit}`;
}

/* ------------------------------------------------------------------ */
/*  Canvas drawing                                                     */
/* ------------------------------------------------------------------ */

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  config: OverlayConfig,
  left: number,
  right: number,
  width: number,
  height: number,
  yOffset: number,
  chartHeight: number,
) {
  const { data, color, logScale, unit, label } = config;

  // Filter data points in range (with some margin)
  const margin = (right - left) * 0.05;
  const visibleData = data.filter(d => d.year >= left - margin && d.year <= right + margin);
  if (visibleData.length < 2) return;

  // Compute Y range
  let minVal = Infinity;
  let maxVal = -Infinity;
  for (const d of visibleData) {
    const v = logScale ? Math.log10(Math.max(d.value, 0.1)) : d.value;
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }
  if (maxVal === minVal) { maxVal += 1; minVal -= 1; }
  const yPad = (maxVal - minVal) * 0.1;
  minVal -= yPad;
  maxVal += yPad;

  const toX = (year: number) => ((year - left) / (right - left)) * width;
  const toY = (val: number) => {
    const v = logScale ? Math.log10(Math.max(val, 0.1)) : val;
    return yOffset + chartHeight - ((v - minVal) / (maxVal - minVal)) * chartHeight;
  };

  // Draw line
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.7;

  // Interpolate many points for smooth curve
  const steps = Math.min(width, 400);
  let first = true;
  for (let i = 0; i <= steps; i++) {
    const year = left + (i / steps) * (right - left);
    const val = interpolate(data, year);
    if (val === null) continue;
    const x = toX(year);
    const y = toY(val);
    if (first) { ctx.moveTo(x, y); first = false; }
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Fill area under the curve
  if (!first) {
    const lastYear = Math.min(right, data[data.length - 1].year);
    const firstYear = Math.max(left, data[0].year);
    ctx.lineTo(toX(lastYear), yOffset + chartHeight);
    ctx.lineTo(toX(firstYear), yOffset + chartHeight);
    ctx.closePath();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Y-axis label
  ctx.globalAlpha = 0.8;
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.fillText(label, 8, yOffset + 12);

  // Min/max labels
  ctx.globalAlpha = 0.5;
  ctx.font = '9px monospace';
  const topVal = interpolate(data, left) ?? visibleData[0].value;
  const botVal = interpolate(data, right) ?? visibleData[visibleData.length - 1].value;
  ctx.fillText(formatValue(topVal, unit, logScale), 8, yOffset + 24);
  ctx.fillText(formatValue(botVal, unit, logScale), width - 70, yOffset + 24);

  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------ */
/*  Per-region drawing                                                 */
/* ------------------------------------------------------------------ */

function getRegionColor(regionId: string): string {
  return REGION_LANES.find(r => r.id === regionId)?.color ?? '#ffffff';
}

type PerRegionMode = 'population' | 'gdp' | 'trade';

function drawPerRegionOverlay(
  ctx: CanvasRenderingContext2D,
  mode: PerRegionMode,
  enabledSeries: Record<string, boolean>,
  left: number,
  right: number,
  width: number,
  height: number,
) {
  let seriesList: { id: string; label: string; color: string; data: DataPoint[] }[] = [];

  if (mode === 'population') {
    seriesList = POPULATION_BY_REGION
      .filter(s => enabledSeries[s.regionId] !== false)
      .map(s => ({ id: s.regionId, label: s.label, color: getRegionColor(s.regionId), data: s.data }));
  } else if (mode === 'gdp') {
    seriesList = GDP_BY_CIVILIZATION
      .filter(s => enabledSeries[s.id] !== false)
      .map(s => ({ id: s.id, label: s.label, color: getRegionColor(s.regionId), data: s.data }));
  } else {
    seriesList = TRADE_ROUTE_VOLUMES
      .filter(s => enabledSeries[s.id] !== false)
      .map(s => ({ id: s.id, label: s.label, color: s.color, data: s.data }));
  }

  if (seriesList.length === 0) return;

  // Compute global Y range across all series
  let globalMin = Infinity;
  let globalMax = -Infinity;
  const margin = (right - left) * 0.05;
  for (const series of seriesList) {
    for (const d of series.data) {
      if (d.year >= left - margin && d.year <= right + margin) {
        const v = Math.log10(Math.max(d.value, 0.1));
        if (v < globalMin) globalMin = v;
        if (v > globalMax) globalMax = v;
      }
    }
  }
  if (!isFinite(globalMin) || globalMin === globalMax) { globalMin = 0; globalMax = 1; }
  const yPad = (globalMax - globalMin) * 0.1;
  globalMin -= yPad;
  globalMax += yPad;

  const CHART_TOP = 40;
  const CHART_BOTTOM = height - 20;
  const chartH = CHART_BOTTOM - CHART_TOP;

  const toX = (year: number) => ((year - left) / (right - left)) * width;
  const toY = (val: number) => {
    const v = Math.log10(Math.max(val, 0.1));
    return CHART_TOP + chartH - ((v - globalMin) / (globalMax - globalMin)) * chartH;
  };

  // Title
  ctx.globalAlpha = 0.8;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillStyle = '#ffffffcc';
  ctx.textAlign = 'left';
  const titles: Record<string, string> = { population: 'Population by Region', gdp: 'GDP by Civilization', trade: 'Trade Route Volume' };
  ctx.fillText(titles[mode] ?? '', 10, 16);

  // Draw each series
  const steps = Math.min(width, 400);
  for (const series of seriesList) {
    ctx.beginPath();
    ctx.strokeStyle = series.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.55;

    let first = true;
    for (let i = 0; i <= steps; i++) {
      const year = left + (i / steps) * (right - left);
      const val = interpolate(series.data, year);
      if (val === null) continue;
      const x = toX(year);
      const y = toY(val);
      if (first) { ctx.moveTo(x, y); first = false; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Legend
  ctx.globalAlpha = 1;
  let legendX = 10;
  const legendY = height - 8;
  ctx.font = '9px system-ui, sans-serif';
  for (const series of seriesList) {
    ctx.fillStyle = series.color;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(legendX, legendY - 6, 10, 3);
    ctx.fillText(series.label, legendX + 14, legendY - 2);
    legendX += ctx.measureText(series.label).width + 24;
  }
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

type TabMode = 'global' | 'perRegion';

export default function DataOverlays() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<TabMode>('global');
  const [perRegionMode, setPerRegionMode] = useState<PerRegionMode>('population');
  const [seriesEnabled, setSeriesEnabled] = useState<Record<string, boolean>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const perRegionCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewport = useTimelineStore(s => s.viewport);

  const activeOverlays = OVERLAYS.filter(o => enabled[o.key]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || activeOverlays.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const [left, right] = getVisibleRange(viewport);
    const chartHeight = rect.height / activeOverlays.length;

    activeOverlays.forEach((overlay, i) => {
      drawOverlay(ctx, overlay, left, right, rect.width, rect.height, i * chartHeight, chartHeight);
    });
  }, [activeOverlays, viewport]);

  useEffect(() => { draw(); }, [draw]);

  // Per-region draw
  const drawPerRegion = useCallback(() => {
    const canvas = perRegionCanvasRef.current;
    if (!canvas || tab !== 'perRegion') return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const [left, right] = getVisibleRange(viewport);
    drawPerRegionOverlay(ctx, perRegionMode, seriesEnabled, left, right, rect.width, rect.height);
  }, [tab, perRegionMode, seriesEnabled, viewport]);

  useEffect(() => { drawPerRegion(); }, [drawPerRegion]);

  const toggle = (key: string) => setEnabled(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleSeries = (id: string) => setSeriesEnabled(prev => ({ ...prev, [id]: prev[id] === false ? true : false }));

  const hasAny = activeOverlays.length > 0;

  return (
    <>
      {/* Toggle panel */}
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span style={{ fontSize: 14 }}>📊</span>
          <span style={{ color: '#ffffffcc', fontSize: 12, fontWeight: 600, letterSpacing: 0.3 }}>
            Data Overlays
          </span>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {(['global', 'perRegion'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                background: tab === t ? 'rgba(255,255,255,0.06)' : 'transparent',
                border: 'none',
                borderBottom: tab === t ? '2px solid #6495ed' : '2px solid transparent',
                color: tab === t ? '#ffffffcc' : '#ffffff50',
                fontSize: 10,
                fontWeight: 600,
                padding: '6px 0',
                cursor: 'pointer',
                letterSpacing: 0.3,
              }}
            >
              {t === 'global' ? 'Global' : 'Per Region'}
            </button>
          ))}
        </div>

        {/* Global toggles */}
        {tab === 'global' && (
          <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {OVERLAYS.map(o => (
              <label
                key={o.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  padding: '4px 0',
                }}
              >
                <div
                  onClick={() => toggle(o.key)}
                  style={{
                    width: 32,
                    height: 16,
                    borderRadius: 8,
                    background: enabled[o.key] ? `${o.color}60` : 'rgba(255,255,255,0.1)',
                    position: 'relative',
                    transition: 'background 0.2s',
                    flexShrink: 0,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: enabled[o.key] ? o.color : '#ffffff40',
                    position: 'absolute',
                    top: 2,
                    left: enabled[o.key] ? 18 : 2,
                    transition: 'left 0.2s, background 0.2s',
                  }} />
                </div>
                <span style={{
                  fontSize: 11,
                  color: enabled[o.key] ? o.color : '#ffffff60',
                  fontWeight: enabled[o.key] ? 600 : 400,
                  transition: 'color 0.2s',
                }}>
                  {o.label}
                </span>
              </label>
            ))}
          </div>
        )}

        {/* Per Region controls */}
        {tab === 'perRegion' && (
          <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Mode selector */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              {([
                { key: 'population' as const, label: 'Pop' },
                { key: 'gdp' as const, label: 'GDP' },
                { key: 'trade' as const, label: 'Trade' },
              ]).map(m => (
                <button
                  key={m.key}
                  onClick={() => setPerRegionMode(m.key)}
                  style={{
                    flex: 1,
                    background: perRegionMode === m.key ? 'rgba(100,149,237,0.2)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${perRegionMode === m.key ? 'rgba(100,149,237,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 4,
                    padding: '3px 0',
                    color: perRegionMode === m.key ? '#6495ed' : '#ffffff50',
                    fontSize: 9,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Series toggles */}
            {perRegionMode === 'population' && POPULATION_BY_REGION.map(s => {
              const color = getRegionColor(s.regionId);
              const on = seriesEnabled[s.regionId] !== false;
              return (
                <label key={s.regionId} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '2px 0' }}>
                  <div
                    onClick={() => toggleSeries(s.regionId)}
                    style={{ width: 10, height: 10, borderRadius: 2, background: on ? color : 'rgba(255,255,255,0.1)', cursor: 'pointer', flexShrink: 0, opacity: on ? 0.8 : 0.3 }}
                  />
                  <span style={{ fontSize: 10, color: on ? color : '#ffffff40' }}>{s.label}</span>
                </label>
              );
            })}
            {perRegionMode === 'gdp' && GDP_BY_CIVILIZATION.map(s => {
              const color = getRegionColor(s.regionId);
              const on = seriesEnabled[s.id] !== false;
              return (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '2px 0' }}>
                  <div
                    onClick={() => toggleSeries(s.id)}
                    style={{ width: 10, height: 10, borderRadius: 2, background: on ? color : 'rgba(255,255,255,0.1)', cursor: 'pointer', flexShrink: 0, opacity: on ? 0.8 : 0.3 }}
                  />
                  <span style={{ fontSize: 10, color: on ? color : '#ffffff40' }}>{s.label}</span>
                </label>
              );
            })}
            {perRegionMode === 'trade' && TRADE_ROUTE_VOLUMES.map(s => {
              const on = seriesEnabled[s.id] !== false;
              return (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '2px 0' }}>
                  <div
                    onClick={() => toggleSeries(s.id)}
                    style={{ width: 10, height: 10, borderRadius: 2, background: on ? s.color : 'rgba(255,255,255,0.1)', cursor: 'pointer', flexShrink: 0, opacity: on ? 0.8 : 0.3 }}
                  />
                  <span style={{ fontSize: 10, color: on ? s.color : '#ffffff40' }}>{s.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Canvas overlay on the timeline (global) */}
      {hasAny && (
        <canvas
          ref={canvasRef}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
      )}

      {/* Canvas overlay on the timeline (per region) */}
      {tab === 'perRegion' && (
        <canvas
          ref={perRegionCanvasRef}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
      )}
    </>
  );
}

/* ================================================================== */
/*  Styles                                                             */
/* ================================================================== */

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 80,
  left: 16,
  width: 200,
  background: 'rgba(13, 17, 23, 0.88)',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(20px)',
  zIndex: 40,
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};
