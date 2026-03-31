export function formatYear(y: number): string {
  const a = Math.abs(y);
  if (a >= 1e9) return `${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1)} billion years ${y < 0 ? 'ago' : 'CE'}`;
  if (a >= 1e6) return `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)} million years ${y < 0 ? 'ago' : 'CE'}`;
  if (a >= 1e4) return `${(a / 1e3).toFixed(0)}K ${y < 0 ? 'BCE' : 'CE'}`;
  if (y < 0) return `${a} BCE`;
  if (y === 0) return '1 CE';
  return `${y} CE`;
}

export function formatYearShort(y: number): string {
  const a = Math.abs(y);
  if (a >= 1e9) return `${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${(a / 1e3).toFixed(0)}K${y < 0 ? ' BCE' : ''}`;
  if (y < 0) return `${a} BCE`;
  if (y === 0) return '1 CE';
  return `${y}`;
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
