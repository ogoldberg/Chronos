import { useState, useCallback } from 'react';
import type { TourStop, Viewport } from '../../types';
import { formatYear } from '../../utils/format';
import { speak, stopSpeech } from '../../utils/speech';

interface Props {
  viewport: Viewport;
  onNavigate: (year: number, span: number) => void;
  onClose: () => void;
}

const PRESET_TOURS: { name: string; emoji: string; stops: TourStop[] }[] = [
  {
    name: 'History of Everything',
    emoji: '🌌',
    stops: [
      { year: -13800000000, span: 2.8e10, text: "13.8 billion years ago, the Big Bang creates space, time, matter, and energy — everything that exists." },
      { year: -4600000000, span: 3e9, text: "Our Solar System forms from a collapsing cloud of gas and dust. Earth takes shape, and the Moon forms from a massive collision." },
      { year: -3800000000, span: 1e9, text: "The first life appears — simple self-replicating molecules in Earth's primordial oceans. Chemistry becomes biology." },
      { year: -541000000, span: 2e8, text: "The Cambrian Explosion: in just 20 million years, all major animal body plans appear. Life gets complex, fast." },
      { year: -66000000, span: 5e7, text: "An asteroid strikes Earth, ending the dinosaurs. Mammals inherit the planet and begin their rise." },
      { year: -300000, span: 5e5, text: "Homo sapiens emerges in Africa. Language, abstract thought, and culture begin to separate us from other species." },
      { year: -12000, span: 2e4, text: "The Agricultural Revolution transforms humanity. We stop wandering and start building — cities, writing, civilization." },
      { year: 2000, span: 50, text: "Here we are. 13.8 billion years of cosmic evolution led to this moment. What comes next is up to us." },
    ],
  },
  {
    name: 'Rise & Fall of Empires',
    emoji: '⚔️',
    stops: [
      { year: -500, span: 300, text: "The Persian Empire stretches from Egypt to India — the largest the world has ever seen. Then a 22-year-old Macedonian named Alexander conquers it all." },
      { year: 0, span: 500, text: "Rome dominates the Mediterranean. Roads, aqueducts, law — its innovations will shape Western civilization for millennia." },
      { year: 700, span: 400, text: "The Islamic Golden Age transforms science, medicine, and mathematics. Baghdad's House of Wisdom preserves and advances Greek knowledge." },
      { year: 1200, span: 200, text: "The Mongol Empire — the largest contiguous land empire in history. Genghis Khan connects East and West through conquest and trade." },
      { year: 1500, span: 200, text: "European colonial empires reshape the world. The Columbian Exchange transforms both hemispheres forever." },
      { year: 1900, span: 100, text: "Empires collapse in the 20th century. Two world wars, decolonization, and the rise of nation-states reshape the global order." },
    ],
  },
  {
    name: 'Inventions That Changed Everything',
    emoji: '💡',
    stops: [
      { year: -3300, span: 1500, text: "Writing is invented in Sumer — accounting records become literature. For the first time, knowledge outlives the individual." },
      { year: 1439, span: 100, text: "Gutenberg's printing press. Within 50 years, 20 million books exist. Ideas spread faster than empires can control them." },
      { year: 1769, span: 50, text: "James Watt's steam engine launches the Industrial Revolution. Human muscle power is replaced by machines." },
      { year: 1879, span: 20, text: "Edison's light bulb. For the first time in history, the night is no longer dark." },
      { year: 1903, span: 15, text: "The Wright Brothers fly for 12 seconds at Kitty Hawk. 66 years later, we walk on the Moon." },
      { year: 1969, span: 5, text: "Armstrong's small step. 600 million watch live as humanity becomes a spacefaring species." },
      { year: 1991, span: 15, text: "Tim Berners-Lee's World Wide Web connects humanity. Communication transforms forever." },
      { year: 2022, span: 5, text: "AI goes mainstream. Large language models transform how we create, learn, and work. A new chapter begins." },
    ],
  },
];

export default function ClassroomMode({ viewport, onNavigate, onClose }: Props) {
  const [selectedTour, setSelectedTour] = useState<number | null>(null);
  const [currentStop, setCurrentStop] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);

  const tour = selectedTour !== null ? PRESET_TOURS[selectedTour] : null;
  const timerRef = useRef<number>(0);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => { clearTimeout(timerRef.current); stopSpeech(); };
  }, []);

  const playStop = useCallback((stops: TourStop[], idx: number) => {
    clearTimeout(timerRef.current);
    if (idx >= stops.length) {
      setPlaying(false);
      return;
    }
    const stop = stops[idx];
    setCurrentStop(idx);
    setPlaying(true);
    onNavigate(stop.year, stop.span);

    if (voiceOn) {
      timerRef.current = window.setTimeout(() => {
        speak(stop.text, () => {
          timerRef.current = window.setTimeout(() => playStop(stops, idx + 1), 1000);
        });
      }, 2000);
    } else {
      const delay = Math.max(stop.text.length * 40, 4000) + 2000;
      timerRef.current = window.setTimeout(() => playStop(stops, idx + 1), delay);
    }
  }, [onNavigate, voiceOn]);

  const startTour = (idx: number) => {
    setSelectedTour(idx);
    setCurrentStop(0);
    playStop(PRESET_TOURS[idx].stops, 0);
  };

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'rgba(5, 5, 15, 0.98)',
      zIndex: 85,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Close */}
      <button
        onClick={() => { stopSpeech(); onClose(); }}
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          background: 'rgba(255,255,255,0.1)',
          border: 'none',
          color: '#fff',
          fontSize: 18,
          cursor: 'pointer',
          borderRadius: '50%',
          width: 40,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ✕
      </button>

      {/* Voice toggle */}
      <button
        onClick={() => setVoiceOn(!voiceOn)}
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          background: voiceOn ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.1)',
          border: 'none',
          color: '#fff',
          fontSize: 18,
          cursor: 'pointer',
          borderRadius: 8,
          padding: '8px 14px',
        }}
      >
        {voiceOn ? '🔊 Voice On' : '🔇 Voice Off'}
      </button>

      {!tour ? (
        /* Tour selection */
        <div style={{ textAlign: 'center', maxWidth: 600 }}>
          <h1 style={{ color: '#fff', fontSize: 32, fontWeight: 300, marginBottom: 8 }}>
            CHRONOS Classroom
          </h1>
          <p style={{ color: '#ffffff60', fontSize: 14, marginBottom: 40 }}>
            Choose a guided tour. Sit back and learn.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {PRESET_TOURS.map((t, i) => (
              <button
                key={i}
                onClick={() => startTour(i)}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 14,
                  padding: '20px 24px',
                  color: '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              >
                <div style={{ fontSize: 20, marginBottom: 4 }}>
                  {t.emoji} {t.name}
                </div>
                <div style={{ color: '#ffffff50', fontSize: 12 }}>
                  {t.stops.length} stops · {Math.round(t.stops.length * 8 / 60)} min estimated
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Active tour */
        <div style={{
          textAlign: 'center',
          maxWidth: 700,
          padding: '0 20px',
        }}>
          {/* Progress */}
          <div style={{
            display: 'flex',
            gap: 6,
            justifyContent: 'center',
            marginBottom: 40,
          }}>
            {tour.stops.map((_, i) => (
              <div
                key={i}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: i === currentStop ? '#3b82f6' : i < currentStop ? '#3b82f660' : 'rgba(255,255,255,0.1)',
                  transition: 'background 0.3s',
                }}
              />
            ))}
          </div>

          {/* Era label */}
          <div style={{ color: '#ffffff40', fontSize: 14, fontFamily: 'monospace', marginBottom: 16 }}>
            {formatYear(tour.stops[currentStop].year)}
          </div>

          {/* Narration */}
          <p style={{
            color: '#ffffffee',
            fontSize: 24,
            lineHeight: 1.5,
            fontWeight: 300,
            maxWidth: 600,
            margin: '0 auto 40px',
          }}>
            {tour.stops[currentStop].text}
          </p>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={() => {
                stopSpeech();
                if (currentStop > 0) {
                  setCurrentStop(currentStop - 1);
                  onNavigate(tour.stops[currentStop - 1].year, tour.stops[currentStop - 1].span);
                }
              }}
              disabled={currentStop === 0}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 10,
                padding: '10px 20px',
                color: currentStop === 0 ? '#ffffff30' : '#fff',
                cursor: currentStop === 0 ? 'not-allowed' : 'pointer',
                fontSize: 14,
              }}
            >
              ← Previous
            </button>
            <button
              onClick={() => {
                stopSpeech();
                if (playing) {
                  setPlaying(false);
                } else {
                  playStop(tour.stops, currentStop);
                }
              }}
              style={{
                background: playing ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)',
                border: `1px solid ${playing ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.4)'}`,
                borderRadius: 10,
                padding: '10px 24px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {playing ? '⏸ Pause' : '▶ Play'}
            </button>
            <button
              onClick={() => {
                stopSpeech();
                if (currentStop < tour.stops.length - 1) {
                  setCurrentStop(currentStop + 1);
                  onNavigate(tour.stops[currentStop + 1].year, tour.stops[currentStop + 1].span);
                }
              }}
              disabled={currentStop >= tour.stops.length - 1}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 10,
                padding: '10px 20px',
                color: currentStop >= tour.stops.length - 1 ? '#ffffff30' : '#fff',
                cursor: currentStop >= tour.stops.length - 1 ? 'not-allowed' : 'pointer',
                fontSize: 14,
              }}
            >
              Next →
            </button>
          </div>

          {/* Back to menu */}
          <button
            onClick={() => { stopSpeech(); setSelectedTour(null); setPlaying(false); }}
            style={{
              marginTop: 24,
              background: 'none',
              border: 'none',
              color: '#ffffff40',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            ← Back to tour list
          </button>
        </div>
      )}
    </div>
  );
}
