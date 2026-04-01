/**
 * History Soundtrack — period-appropriate ambient audio as you scroll
 *
 * Uses Web Audio API to generate ambient tones that shift with the era.
 * No actual music files needed — generates drone/ambient tones procedurally.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface Props {
  currentYear: number;
  onClose: () => void;
}

interface EraSound {
  name: string;
  minYear: number;
  maxYear: number;
  // Oscillator parameters
  baseFreq: number;
  type: OscillatorType;
  gainLevel: number;
  filterFreq: number;
  description: string;
}

const ERA_SOUNDS: EraSound[] = [
  { name: 'Cosmic Hum', minYear: -Infinity, maxYear: -1e8, baseFreq: 55, type: 'sine', gainLevel: 0.08, filterFreq: 200, description: 'Deep resonance of the cosmos' },
  { name: 'Primordial Drone', minYear: -1e8, maxYear: -12000, baseFreq: 80, type: 'triangle', gainLevel: 0.06, filterFreq: 400, description: 'Earth forming, life evolving' },
  { name: 'Ancient Chant', minYear: -12000, maxYear: -500, baseFreq: 130, type: 'sine', gainLevel: 0.07, filterFreq: 800, description: 'First civilizations' },
  { name: 'Classical Harmony', minYear: -500, maxYear: 500, baseFreq: 196, type: 'triangle', gainLevel: 0.06, filterFreq: 1200, description: 'Greek and Roman golden ages' },
  { name: 'Medieval Resonance', minYear: 500, maxYear: 1400, baseFreq: 165, type: 'sine', gainLevel: 0.06, filterFreq: 600, description: 'Cathedrals and monasteries' },
  { name: 'Renaissance Light', minYear: 1400, maxYear: 1700, baseFreq: 220, type: 'triangle', gainLevel: 0.05, filterFreq: 1500, description: 'Rebirth of art and science' },
  { name: 'Enlightenment Clarity', minYear: 1700, maxYear: 1850, baseFreq: 262, type: 'sine', gainLevel: 0.05, filterFreq: 2000, description: 'Reason and revolution' },
  { name: 'Industrial Pulse', minYear: 1850, maxYear: 1940, baseFreq: 147, type: 'sawtooth', gainLevel: 0.03, filterFreq: 1000, description: 'Machines and progress' },
  { name: 'Atomic Tension', minYear: 1940, maxYear: 1970, baseFreq: 185, type: 'square', gainLevel: 0.02, filterFreq: 800, description: 'Cold War anxiety' },
  { name: 'Digital Ambient', minYear: 1970, maxYear: 2010, baseFreq: 330, type: 'sine', gainLevel: 0.04, filterFreq: 3000, description: 'Information age' },
  { name: 'AI Shimmer', minYear: 2010, maxYear: Infinity, baseFreq: 440, type: 'sine', gainLevel: 0.04, filterFreq: 4000, description: 'The present moment' },
];

function getEraSound(year: number): EraSound {
  for (const era of ERA_SOUNDS) {
    if (year >= era.minYear && year < era.maxYear) return era;
  }
  return ERA_SOUNDS[0];
}

export default function HistorySoundtrack({ currentYear, onClose }: Props) {
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const currentEra = getEraSound(currentYear);

  const start = useCallback(() => {
    if (audioCtxRef.current) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = 'lowpass';
    filter.frequency.value = currentEra.filterFreq;
    filter.Q.value = 1;

    osc.type = currentEra.type;
    osc.frequency.value = currentEra.baseFreq;
    gain.gain.value = currentEra.gainLevel * volume;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    audioCtxRef.current = ctx;
    oscRef.current = osc;
    gainRef.current = gain;
    filterRef.current = filter;
    setPlaying(true);
  }, [currentEra, volume]);

  const stop = useCallback(() => {
    oscRef.current?.stop();
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    oscRef.current = null;
    gainRef.current = null;
    filterRef.current = null;
    setPlaying(false);
  }, []);

  // Update sound when era changes
  useEffect(() => {
    if (!playing || !oscRef.current || !filterRef.current || !gainRef.current) return;
    const era = getEraSound(currentYear);
    oscRef.current.frequency.linearRampToValueAtTime(era.baseFreq, audioCtxRef.current!.currentTime + 2);
    oscRef.current.type = era.type;
    filterRef.current.frequency.linearRampToValueAtTime(era.filterFreq, audioCtxRef.current!.currentTime + 2);
    gainRef.current.gain.linearRampToValueAtTime(era.gainLevel * volume, audioCtxRef.current!.currentTime + 1);
  }, [currentYear, playing, volume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (audioCtxRef.current) { oscRef.current?.stop(); audioCtxRef.current.close(); } };
  }, []);

  return (
    <div style={{
      position: 'absolute', bottom: 80, left: 20,
      width: 280, background: 'rgba(10, 14, 22, 0.94)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 14, backdropFilter: 'blur(20px)',
      padding: 16, zIndex: 30,
      animation: 'panelSlideUp 0.3s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>🎵 Soundtrack</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ffffff40', cursor: 'pointer' }}>✕</button>
      </div>

      <div style={{ color: currentEra.name === 'Cosmic Hum' ? '#9370db' : '#ffffffcc', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
        {currentEra.name}
      </div>
      <div style={{ color: '#ffffff50', fontSize: 11, marginBottom: 12 }}>
        {currentEra.description}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <button
          onClick={playing ? stop : start}
          style={{
            padding: '6px 16px',
            background: playing ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)',
            border: `1px solid ${playing ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)'}`,
            borderRadius: 8, color: '#fff', fontSize: 12, cursor: 'pointer',
          }}
        >
          {playing ? '⏹ Stop' : '▶ Play'}
        </button>
        <input
          type="range"
          min="0" max="1" step="0.1"
          value={volume}
          onChange={e => setVolume(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: '#3b82f6' }}
        />
        <span style={{ color: '#ffffff40', fontSize: 10 }}>{Math.round(volume * 100)}%</span>
      </div>
    </div>
  );
}
