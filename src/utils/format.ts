const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function formatYear(y: number): string {
  const a = Math.abs(y);
  if (a >= 1e9) return `${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1)} billion years ${y < 0 ? 'ago' : 'CE'}`;
  if (a >= 1e6) return `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)} million years ${y < 0 ? 'ago' : 'CE'}`;
  if (a >= 1e4) return `${(a / 1e3).toFixed(0)}K ${y < 0 ? 'BCE' : 'CE'}`;
  if (y < 0) return `${Math.round(a)} BCE`;
  if (y === 0) return '1 CE';
  // Sub-year: show month if fractional
  const wholeYear = Math.floor(y);
  const frac = y - wholeYear;
  if (frac > 0.01 && wholeYear > 0) {
    const monthIdx = Math.floor(frac * 12);
    return `${MONTHS[monthIdx]} ${wholeYear} CE`;
  }
  return `${wholeYear} CE`;
}

/** Format a timestamp string to human-readable */
export function formatTimestamp(ts: string, precision?: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  switch (precision) {
    case 'minute':
    case 'hour':
      return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    case 'day':
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    case 'week':
    case 'month':
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    case 'quarter':
      return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
    default:
      return `${d.getFullYear()} CE`;
  }
}

export function formatYearShort(y: number): string {
  const a = Math.abs(y);
  if (a >= 1e9) return `${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${(a / 1e3).toFixed(0)}K${y < 0 ? ' BCE' : ''}`;
  if (y < 0) return `${Math.round(a)} BCE`;
  if (y === 0) return '1 CE';
  return `${Math.round(y)}`;
}

export function scaleLabel(span: number): string {
  if (span > 1e9) return 'COSMIC';
  if (span > 1e7) return 'GEOLOGICAL';
  if (span > 1e5) return 'EVOLUTIONARY';
  if (span > 5000) return 'DEEP HISTORY';
  if (span > 500) return 'ANCIENT';
  if (span > 50) return 'HISTORICAL';
  if (span > 5) return 'MODERN';
  return 'CONTEMPORARY';
}

export function depthLevel(span: number): number {
  if (span > 1e9) return 0;
  if (span > 1e7) return 1;
  if (span > 1e5) return 2;
  if (span > 5000) return 3;
  if (span > 500) return 4;
  if (span > 50) return 5;
  if (span > 5) return 6;
  return 7;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
