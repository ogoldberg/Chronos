import { useEffect, useRef, useState } from 'react';
import type { Viewport } from '../types';
import { nowYear } from '../canvas/viewport';

interface Props {
  viewport: Viewport;
  onNavigate: (year: number, span: number) => void;
  onClose: () => void;
}

interface Preset {
  label: string;
  emoji: string;
  year: number;
  span: number;
  hint: string;
}

// Preset eras the user can jump to with one click. Span values are picked so
// that each preset lands the user somewhere contextually useful (enough
// surrounding years to see the big events of that era, but not so zoomed out
// that the era itself disappears into a blob).
const PRESETS: Preset[] = [
  { label: 'Big Bang',           emoji: '💥', year: -13.8e9, span: 2e9,    hint: '13.8 Ga — origin of the universe' },
  { label: 'Earth forms',        emoji: '🌍', year: -4.54e9, span: 5e8,    hint: '4.54 Ga' },
  { label: 'First life',         emoji: '🦠', year: -3.8e9,  span: 5e8,    hint: '3.8 Ga' },
  { label: 'Cambrian explosion', emoji: '🐚', year: -541e6,  span: 1e8,    hint: '541 Ma' },
  { label: 'Pangaea',            emoji: '🧩', year: -200e6,  span: 1e8,    hint: '200 Ma — Triassic' },
  { label: 'Dinosaurs die',      emoji: '☄️', year: -66e6,   span: 5e7,    hint: '66 Ma — K-Pg extinction' },
  { label: 'Homo sapiens',       emoji: '🧠', year: -300000, span: 2e5,    hint: '~300 ka' },
  { label: 'Agriculture',        emoji: '🌾', year: -10000,  span: 8000,   hint: 'Neolithic Revolution' },
  { label: 'Ancient Egypt',      emoji: '🏺', year: -2500,   span: 2000,   hint: 'Old Kingdom' },
  { label: 'Classical Greece',   emoji: '🏛️', year: -400,    span: 600,    hint: '5th century BCE' },
  { label: 'Roman peak',         emoji: '🏛️', year: 117,     span: 400,    hint: 'Trajan' },
  { label: 'Fall of Rome',       emoji: '⚔️', year: 476,     span: 300,    hint: 'Sack of Rome' },
  { label: 'Islamic Golden Age', emoji: '🕌', year: 900,     span: 400,    hint: '8th–14th c.' },
  { label: 'Renaissance',        emoji: '🎨', year: 1500,    span: 200,    hint: 'Italy' },
  { label: 'Industrial Rev.',    emoji: '🏭', year: 1850,    span: 150,    hint: 'c. 1760–1840' },
  { label: 'World War II',       emoji: '💣', year: 1942,    span: 30,     hint: '1939–1945' },
  { label: 'Space Age',          emoji: '🚀', year: 1969,    span: 50,     hint: 'Moon landing' },
  // "Now" uses a sentinel year of NaN and is resolved to the live
  // `nowYear()` inside the component so it tracks the real clock
  // rather than whatever was "now" at module load time.
  { label: 'Now',                emoji: '📍', year: NaN,      span: 30,    hint: 'Present day' },
];

/**
 * Parse a user-typed date string into a Chronos year number.
 *
 * Accepted formats:
 *   "2024"               → 2024
 *   "2024 CE" / "2024 AD" → 2024
 *   "500 BCE" / "500 BC" → -500
 *   "3000BC"             → -3000
 *   "5ka" / "5000 years ago" → current year - 5000
 *   "1.5ma" / "1.5 million years ago" → -1.5e6
 *   "200ma" / "200my"    → -2e8
 *   "4.5ga" / "4.5 billion years ago" → -4.5e9
 *   "-1000"              → -1000 (raw BCE)
 *   ISO-like dates like "1969-07-20" → 1969 (year only, we ignore month/day)
 *
 * Returns null if the input can't be parsed.
 */
function parseYearInput(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;

  // Pure integer (with optional leading minus) — treat as raw Chronos year.
  const intMatch = s.match(/^-?\d+$/);
  if (intMatch) {
    const n = parseInt(s, 10);
    if (n < -14e9 || n > nowYear()) return null;
    return n;
  }

  // ISO-like: "1969-07-20" or "1969/7/20"
  const isoMatch = s.match(/^(\d{1,4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (isoMatch) return parseInt(isoMatch[1], 10);

  // "1969-07" (year-month, ignore month)
  const ymMatch = s.match(/^(\d{1,4})[-\/](\d{1,2})$/);
  if (ymMatch) return parseInt(ymMatch[1], 10);

  // "X BCE/BC" or "X CE/AD"
  const eraMatch = s.match(/^(\d+(?:\.\d+)?)\s*(bce|bc|ce|ad)$/);
  if (eraMatch) {
    const n = parseFloat(eraMatch[1]);
    const era = eraMatch[2];
    return era === 'bce' || era === 'bc' ? -n : n;
  }

  // "X years ago" or "X ago"
  const agoMatch = s.match(/^(\d+(?:\.\d+)?)\s*(thousand|million|billion)?\s*years?\s*(ago)?$/);
  if (agoMatch) {
    let n = parseFloat(agoMatch[1]);
    const unit = agoMatch[2];
    if (unit === 'thousand') n *= 1e3;
    else if (unit === 'million') n *= 1e6;
    else if (unit === 'billion') n *= 1e9;
    return nowYear() - n;
  }

  // Shorthand units: 5ka / 5kya / 1.5ma / 1.5mya / 200my / 4.5ga / 4.5gya
  const shortMatch = s.match(/^(\d+(?:\.\d+)?)\s*(ka|kya|ma|mya|my|ga|gya|gy)$/);
  if (shortMatch) {
    const n = parseFloat(shortMatch[1]);
    const unit = shortMatch[2];
    if (unit === 'ka' || unit === 'kya') return nowYear() - n * 1e3;
    if (unit === 'ma' || unit === 'mya' || unit === 'my') return -n * 1e6;
    if (unit === 'ga' || unit === 'gya' || unit === 'gy') return -n * 1e9;
  }

  return null;
}

/**
 * Pick a viewport span that puts the target year inside a context window
 * proportional to how-far-ago it is. The earlier code preserved the user's
 * current span verbatim, which silently broke jumps from a 14-billion-year
 * cosmic view to a year like 1453: the clamp inside the viewport (the right
 * edge can't exceed `nowYear()`) snapped the centre back to ~-7 Gyr because
 * `1453 + 14e9/2 \u226b nowYear()`.
 *
 * The buckets here are picked so each tier shows enough surrounding history
 * to be useful but doesn't dissolve the target year into a smear. They line
 * up with the spans the preset jumps already use.
 */
function pickSpanForYear(target: number): number {
  const yearsAgo = Math.max(1, nowYear() - target);
  if (yearsAgo < 50)        return 30;          // last few decades
  if (yearsAgo < 500)       return 200;         // century
  if (yearsAgo < 5_000)     return 1_500;       // recorded history
  if (yearsAgo < 50_000)    return 20_000;      // late prehistory
  if (yearsAgo < 1_000_000) return 500_000;     // human evolution
  if (yearsAgo < 100e6)     return 20e6;        // mammals / cenozoic
  if (yearsAgo < 1e9)       return 200e6;       // phanerozoic
  return 2e9;                                    // deep cosmic
}

/**
 * Floating popover that lets the user type a date/era OR pick from a preset
 * list. Positioned relative to the zoom badge in the top-right.
 *
 * Typing a raw year jumps to a span chosen by `pickSpanForYear` based on
 * the target year's distance from now. Selecting a preset uses that
 * preset's hand-picked span.
 */
export default function DatePickerPopover({ viewport: _viewport, onNavigate, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [parsed, setParsed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus on mount so the user can start typing immediately.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Esc closes the popover from anywhere inside it.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setError(null);
    if (!value.trim()) {
      setParsed(null);
      return;
    }
    const result = parseYearInput(value);
    if (result == null) {
      setParsed(null);
    } else {
      setParsed(result);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsed == null) {
      setError("Couldn't parse that. Try '1969', '500 BCE', '65 mya', or pick a preset.");
      return;
    }
    // Pick a span proportional to how-far-ago the target is. We deliberately
    // do NOT preserve viewport.span: a 14-billion-year span centred on 1453
    // would have its right edge at year ~7e9, which is past nowYear(), and
    // the viewport clamp would silently snap us back to deep cosmic time.
    onNavigate(parsed, pickSpanForYear(parsed));
    onClose();
  };

  const handlePreset = (preset: Preset) => {
    // "Now" stores NaN as a sentinel and is resolved here so the jump
    // lands on the real current year, not the year the module loaded.
    // We also nudge the center left by half the span so the right edge
    // sits right at today (we don't show the future).
    const now = nowYear();
    const year = Number.isNaN(preset.year) ? now - preset.span / 2 : preset.year;
    onNavigate(year, preset.span);
    onClose();
  };

  // Filter presets against the query so typing "rom" narrows to Rome, etc.
  const filter = query.trim().toLowerCase();
  const filteredPresets = filter
    ? PRESETS.filter(p =>
        p.label.toLowerCase().includes(filter) ||
        p.hint.toLowerCase().includes(filter))
    : PRESETS;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'transparent',
          zIndex: 60,
        }}
      />
      <div
        role="dialog"
        aria-label="Jump to a point in time"
        style={{
          position: 'fixed',
          top: 56,
          right: 20,
          width: 320,
          maxHeight: 'calc(100vh - 80px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(13, 17, 23, 0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          backdropFilter: 'blur(20px)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          zIndex: 61,
          overflow: 'hidden',
          color: '#fff',
        }}
      >
        {/* Input */}
        <form onSubmit={handleSubmit} style={{ padding: 14 }}>
          <label
            style={{
              display: 'block',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 1,
              color: '#ffffff60',
              marginBottom: 6,
              textTransform: 'uppercase',
            }}
          >
            Jump to a date
          </label>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            placeholder="e.g. 1969, 500 BCE, 65 mya, 4.5 ga"
            style={{
              width: '100%',
              padding: '9px 12px',
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${error ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: 8,
              color: '#fff',
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {parsed != null && (
            <div style={{ fontSize: 11, color: '#60a5fa', marginTop: 6 }}>
              → {formatParsedYear(parsed)}{' '}
              <span style={{ color: '#ffffff40' }}>press Enter to jump</span>
            </div>
          )}
          {error && (
            <div style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>{error}</div>
          )}
        </form>

        {/* Preset list */}
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            padding: '8px 6px 10px',
            overflowY: 'auto',
            flex: 1,
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: 1,
              color: '#ffffff40',
              textTransform: 'uppercase',
              padding: '4px 10px 6px',
            }}
          >
            {filter ? 'Matching presets' : 'Quick jumps'}
          </div>
          {filteredPresets.length === 0 && (
            <div style={{ padding: '8px 10px', fontSize: 12, color: '#ffffff60' }}>
              No matching presets.
            </div>
          )}
          {filteredPresets.map(p => (
            <button
              key={p.label}
              onClick={() => handlePreset(p)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '8px 10px',
                background: 'transparent',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                fontSize: 13,
                textAlign: 'left',
                cursor: 'pointer',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{p.emoji}</span>
              <span style={{ flex: 1, fontWeight: 600 }}>{p.label}</span>
              <span style={{ fontSize: 10, color: '#ffffff50' }}>{p.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/** Format a parsed year for the "→ ..." preview line. */
function formatParsedYear(y: number): string {
  const a = Math.abs(y);
  if (a >= 1e9) return `${(a / 1e9).toFixed(2)} billion years ${y < 0 ? 'ago' : 'CE'}`;
  if (a >= 1e6) return `${(a / 1e6).toFixed(1)} million years ${y < 0 ? 'ago' : 'CE'}`;
  if (a >= 1e4) return `${Math.round(a / 1e3)}K ${y < 0 ? 'BCE' : 'CE'}`;
  if (y < 0) return `${Math.round(a)} BCE`;
  if (y === 0) return '1 CE';
  return `${Math.round(y)} CE`;
}
