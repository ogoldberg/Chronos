import type { Viewport } from '../types';

interface Chip {
  label: string;
  emoji: string;
  year: number;
  span: number;
}

const CHIPS: Chip[] = [
  { label: 'Big Bang', emoji: '💥', year: -13e9, span: 2.8e10 },
  { label: 'Earth', emoji: '🌍', year: -4e9, span: 3e9 },
  { label: 'Life', emoji: '🦠', year: -2e9, span: 4e9 },
  { label: 'Cambrian', emoji: '🐚', year: -4e8, span: 5e8 },
  { label: 'Dinosaurs', emoji: '🦕', year: -1.5e8, span: 2e8 },
  { label: 'Humans', emoji: '🧠', year: -2e5, span: 5e5 },
  { label: 'Civilization', emoji: '🏛️', year: -3000, span: 8000 },
  { label: 'Classical', emoji: '⚔️', year: 0, span: 1500 },
  { label: 'Medieval', emoji: '🏰', year: 1000, span: 600 },
  { label: 'Modern', emoji: '🏭', year: 1800, span: 300 },
  { label: 'Now', emoji: '📍', year: 2000, span: 50 },
];

interface Props {
  viewport: Viewport;
  onNavigate: (year: number, span: number) => void;
}

export default function EraChips({ viewport, onNavigate }: Props) {
  return (
    <div style={{
      position: 'absolute',
      top: 12,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: 6,
      zIndex: 20,
      flexWrap: 'wrap',
      justifyContent: 'center',
      maxWidth: '90vw',
    }}>
      {CHIPS.map(chip => {
        const isActive = Math.abs(viewport.centerYear - chip.year) < chip.span * 0.5;
        return (
          <button
            key={chip.label}
            onClick={() => onNavigate(chip.year, chip.span)}
            style={{
              background: isActive ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${isActive ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 20,
              padding: '5px 12px',
              color: isActive ? '#fff' : '#ffffffaa',
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              backdropFilter: 'blur(10px)',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = isActive ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)';
              e.currentTarget.style.borderColor = isActive ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)';
            }}
          >
            <span>{chip.emoji}</span>
            <span>{chip.label}</span>
          </button>
        );
      })}
    </div>
  );
}
