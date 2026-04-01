import { useState, useRef, useEffect, useCallback } from 'react';
import {
  WORLD_POPULATION,
  TEMPERATURE_ANOMALY,
  CO2_CONCENTRATION,
  GDP_ESTIMATES,
  type DataPoint,
} from '../../data/climateData';
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
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DataOverlays() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  const toggle = (key: string) => setEnabled(prev => ({ ...prev, [key]: !prev[key] }));

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
              {/* Toggle switch */}
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
      </div>

      {/* Canvas overlay on the timeline */}
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
