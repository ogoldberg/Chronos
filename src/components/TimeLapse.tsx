import { useState, useCallback, useRef, useEffect } from 'react';

interface Props {
  onNavigate: (year: number, span: number) => void;
  onClose: () => void;
  currentYear: number;
}

interface SpeedPreset {
  label: string;
  yearsPerSecond: number;
}

interface QuickPreset {
  label: string;
  startYear: number;
  endYear: number;
}

const SPEED_PRESETS: SpeedPreset[] = [
  { label: 'Slow', yearsPerSecond: 10 },
  { label: 'Normal', yearsPerSecond: 100 },
  { label: 'Fast', yearsPerSecond: 1000 },
  { label: 'Cosmic', yearsPerSecond: 1_000_000 },
];

const QUICK_PRESETS: QuickPreset[] = [
  { label: 'Human History', startYear: -10000, endYear: 2025 },
  { label: 'Last 500 Years', startYear: 1500, endYear: 2025 },
  { label: "Earth's Story", startYear: -4_600_000_000, endYear: 2025 },
];

function formatYear(year: number): string {
  if (Math.abs(year) >= 1_000_000_000) {
    return `${(year / 1_000_000_000).toFixed(2)} B`;
  }
  if (Math.abs(year) >= 1_000_000) {
    return `${(year / 1_000_000).toFixed(2)} M`;
  }
  if (year < 0) {
    return `${Math.abs(Math.round(year)).toLocaleString()} BCE`;
  }
  return `${Math.round(year).toLocaleString()} CE`;
}

export default function TimeLapse({ onNavigate, onClose, currentYear }: Props) {
  const [startYear, setStartYear] = useState(-10000);
  const [endYear, setEndYear] = useState(2025);
  const [speed, setSpeed] = useState(100);
  const [playing, setPlaying] = useState(false);
  const [displayYear, setDisplayYear] = useState(currentYear);

  const playingRef = useRef(false);
  const lastFrameRef = useRef(0);
  const displayYearRef = useRef(currentYear);
  const speedRef = useRef(speed);
  const startYearRef = useRef(startYear);
  const endYearRef = useRef(endYear);
  const rafRef = useRef(0);

  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { startYearRef.current = startYear; }, [startYear]);
  useEffect(() => { endYearRef.current = endYear; }, [endYear]);

  const totalRange = endYear - startYear;
  const progress = totalRange !== 0 ? Math.max(0, Math.min(1, (displayYear - startYear) / totalRange)) : 0;

  const tick = useCallback((timestamp: number) => {
    if (!playingRef.current) return;
    if (lastFrameRef.current === 0) {
      lastFrameRef.current = timestamp;
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    const dt = (timestamp - lastFrameRef.current) / 1000;
    lastFrameRef.current = timestamp;

    const newYear = displayYearRef.current + speedRef.current * dt;
    if (newYear >= endYearRef.current) {
      displayYearRef.current = endYearRef.current;
      setDisplayYear(endYearRef.current);
      // Compute span based on speed
      const span = Math.max(50, speedRef.current * 2);
      onNavigate(endYearRef.current, span);
      playingRef.current = false;
      setPlaying(false);
      return;
    }

    displayYearRef.current = newYear;
    setDisplayYear(newYear);
    const span = Math.max(50, speedRef.current * 2);
    onNavigate(newYear, span);
    rafRef.current = requestAnimationFrame(tick);
  }, [onNavigate]);

  const handlePlay = useCallback(() => {
    if (playingRef.current) {
      // Pause
      playingRef.current = false;
      setPlaying(false);
      cancelAnimationFrame(rafRef.current);
      return;
    }
    // If at end, reset to start
    if (displayYearRef.current >= endYearRef.current) {
      displayYearRef.current = startYearRef.current;
      setDisplayYear(startYearRef.current);
    }
    playingRef.current = true;
    lastFrameRef.current = 0;
    setPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const handleStop = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    cancelAnimationFrame(rafRef.current);
    displayYearRef.current = startYearRef.current;
    setDisplayYear(startYearRef.current);
    const span = Math.max(50, speedRef.current * 2);
    onNavigate(startYearRef.current, span);
  }, [onNavigate]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const year = startYearRef.current + pct * (endYearRef.current - startYearRef.current);
    displayYearRef.current = year;
    setDisplayYear(year);
    const span = Math.max(50, speedRef.current * 2);
    onNavigate(year, span);
  }, [onNavigate]);

  const applyQuickPreset = useCallback((preset: QuickPreset) => {
    const wasPlaying = playingRef.current;
    if (wasPlaying) {
      playingRef.current = false;
      setPlaying(false);
      cancelAnimationFrame(rafRef.current);
    }
    setStartYear(preset.startYear);
    setEndYear(preset.endYear);
    startYearRef.current = preset.startYear;
    endYearRef.current = preset.endYear;
    displayYearRef.current = preset.startYear;
    setDisplayYear(preset.startYear);
    const span = Math.max(50, speedRef.current * 2);
    onNavigate(preset.startYear, span);
  }, [onNavigate]);

  useEffect(() => {
    return () => { cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'rgba(8, 10, 18, 0.92)',
        backdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(99, 102, 241, 0.2)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
        zIndex: 50,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '16px 24px 20px',
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 12,
          right: 16,
          background: 'none',
          border: 'none',
          color: '#ffffff50',
          cursor: 'pointer',
          fontSize: 18,
          padding: 4,
        }}
      >
        {'\u2715'}
      </button>

      {/* Large year display */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div
          style={{
            fontSize: 48,
            fontWeight: 200,
            letterSpacing: 2,
            color: '#e0e7ff',
            fontFamily: 'monospace',
            lineHeight: 1.1,
          }}
        >
          {formatYear(displayYear)}
        </div>
        <div style={{ fontSize: 10, color: '#ffffff40', letterSpacing: 1, marginTop: 4 }}>
          TIME-LAPSE PLAYBACK
        </div>
      </div>

      {/* Progress bar */}
      <div
        onClick={handleProgressClick}
        style={{
          width: '100%',
          height: 6,
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 3,
          cursor: 'pointer',
          marginBottom: 14,
          position: 'relative',
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #6366f1, #818cf8)',
            borderRadius: 3,
            transition: playing ? 'none' : 'width 0.2s',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `${progress * 100}%`,
            top: -3,
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#818cf8',
            transform: 'translateX(-50%)',
            boxShadow: '0 0 8px rgba(99,102,241,0.6)',
          }}
        />
      </div>

      {/* Range labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, fontSize: 10, color: '#ffffff50' }}>
        <span>{formatYear(startYear)}</span>
        <span>{formatYear(endYear)}</span>
      </div>

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        {/* Play / Pause */}
        <button
          onClick={handlePlay}
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: playing
              ? 'linear-gradient(135deg, rgba(245,158,11,0.3), rgba(217,119,6,0.2))'
              : 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(79,70,229,0.2))',
            border: playing
              ? '1px solid rgba(245,158,11,0.5)'
              : '1px solid rgba(99,102,241,0.5)',
            color: playing ? '#fde68a' : '#c7d2fe',
            cursor: 'pointer',
            fontSize: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {playing ? '\u23F8' : '\u25B6'}
        </button>

        {/* Stop */}
        <button
          onClick={handleStop}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#ffffff80',
            cursor: 'pointer',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {'\u25A0'}
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.1)' }} />

        {/* Speed presets */}
        {SPEED_PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => {
              setSpeed(preset.yearsPerSecond);
              speedRef.current = preset.yearsPerSecond;
            }}
            style={{
              padding: '6px 12px',
              fontSize: 11,
              fontWeight: speed === preset.yearsPerSecond ? 700 : 500,
              background: speed === preset.yearsPerSecond
                ? 'rgba(99,102,241,0.2)'
                : 'rgba(255,255,255,0.04)',
              border: speed === preset.yearsPerSecond
                ? '1px solid rgba(99,102,241,0.4)'
                : '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6,
              color: speed === preset.yearsPerSecond ? '#a5b4fc' : '#ffffff80',
              cursor: 'pointer',
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Quick presets */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: '#ffffff40', alignSelf: 'center', marginRight: 4 }}>QUICK:</span>
        {QUICK_PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => applyQuickPreset(preset)}
            style={{
              padding: '5px 10px',
              fontSize: 10,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6,
              color: '#ffffffaa',
              cursor: 'pointer',
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
