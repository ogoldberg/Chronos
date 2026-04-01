import { useState, useCallback, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import type { TimelineEvent, Viewport, TourStop } from './types';
import { ANCHOR_EVENTS } from './data/anchorEvents';
import { clamp, formatYearShort, scaleLabel } from './utils/format';
import { getVisibleRange } from './canvas/viewport';
import { speak, stopSpeech } from './utils/speech';
import { discoverEvents, getCacheStats } from './services/eventDiscovery';
import { readURLState, writeURLState } from './utils/urlState';
import TimelineCanvas from './canvas/TimelineCanvas';
import EraChips from './components/EraChips';
import EventCard from './components/EventCard';
import InsightsPanel from './components/InsightsPanel';
import TourOverlay from './components/TourOverlay';
import LaneToggle from './components/LaneToggle';

// Lazy-loaded heavy components (Three.js globe, chat panel, comparison)
const GlobePanel = lazy(() => import('./components/GlobePanel'));
const ChatPanel = lazy(() => import('./components/ChatPanel'));
const ComparisonView = lazy(() => import('./components/ComparisonView'));
const ClassroomMode = lazy(() => import('./components/ClassroomMode'));
const CurrentEvents = lazy(() => import('./components/CurrentEvents'));
const MythBuster = lazy(() => import('./components/MythBuster'));
const QuizPanel = lazy(() => import('./components/QuizPanel'));
const AuthPanel = lazy(() => import('./components/AuthPanel'));
const LensExplorer = lazy(() => import('./components/LensExplorer'));
import StatsBar from './components/StatsBar';
import AchievementToast from './components/AchievementToast';
import { recordEventView } from './services/gamification';
import { REGION_LANES } from './data/regions';
import './App.css';

export default function App() {
  // Initialize from URL state if present
  const urlState = useMemo(() => readURLState(), []);
  const [viewport, setViewport] = useState<Viewport>(
    urlState.viewport || { centerYear: -4e9, span: 2.8e10 }
  );
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<TimelineEvent | null>(null);
  const [dynamicEvents, setDynamicEvents] = useState<TimelineEvent[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [chatInitMsg, setChatInitMsg] = useState<string | undefined>();
  const [voice, setVoice] = useState(false);
  const [cacheStats, setCacheStats] = useState({ cells: 0, events: 0 });
  const [showGlobe, setShowGlobe] = useState(true);
  const [showComparison, setShowComparison] = useState(false);
  const [showClassroom, setShowClassroom] = useState(false);
  const [showCurrentEvents, setShowCurrentEvents] = useState(false);
  const [showMyths, setShowMyths] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showLenses, setShowLenses] = useState(false);
  const [activeLens, setActiveLens] = useState<{ name: string; emoji: string; color: string } | null>(null);
  const [lanesEnabled, setLanesEnabled] = useState(false);
  const [activeLanes, setActiveLanes] = useState<Set<string>>(
    new Set(REGION_LANES.map(l => l.id))
  );

  // Tour state
  const [tourStops, setTourStops] = useState<TourStop[] | null>(null);
  const [tourIndex, setTourIndex] = useState(0);
  const [tourPlaying, setTourPlaying] = useState(false);
  const tourTimerRef = useRef<number>(0);
  const animRef = useRef<number>(0);

  // All events: anchors + discovered (deduplicated by title)
  const allEvents = useMemo(() => {
    const seen = new Set<string>();
    const result: TimelineEvent[] = [];
    // Anchors first (higher priority)
    for (const ev of ANCHOR_EVENTS) {
      if (!seen.has(ev.title)) {
        seen.add(ev.title);
        result.push(ev);
      }
    }
    for (const ev of dynamicEvents) {
      if (!seen.has(ev.title)) {
        seen.add(ev.title);
        result.push(ev);
      }
    }
    return result;
  }, [dynamicEvents]);

  // Visible events for current viewport
  const visibleEvents = useMemo(() => {
    const [left, right] = getVisibleRange(viewport);
    return allEvents.filter(ev => {
      if (ev.year < left || ev.year > right) return false;
      if (ev.maxSpan && viewport.span > ev.maxSpan) return false;
      return true;
    });
  }, [allEvents, viewport]);

  // Animated navigation
  const animateTo = useCallback((targetYear: number, targetSpan: number, duration = 1500) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const startYear = viewport.centerYear;
    const startSpan = viewport.span;
    const t0 = performance.now();

    function step(now: number) {
      const t = Math.min((now - t0) / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      setViewport({
        centerYear: clamp(startYear + (targetYear - startYear) * ease, -14e9, 2030),
        span: clamp(startSpan + (targetSpan - startSpan) * ease, 0.5, 3e10),
      });
      if (t < 1) animRef.current = requestAnimationFrame(step);
      else animRef.current = 0;
    }
    animRef.current = requestAnimationFrame(step);
  }, [viewport]);

  // Dynamic event discovery — grid-based, unlimited, with caching
  const discoverTimerRef = useRef<number>(0);
  const existingTitlesRef = useRef<Set<string>>(new Set());

  // Keep existing titles set in sync
  useEffect(() => {
    existingTitlesRef.current = new Set(allEvents.map(e => e.title));
  }, [allEvents]);

  // Sync viewport to URL (debounced)
  const urlTimerRef = useRef<number>(0);
  useEffect(() => {
    clearTimeout(urlTimerRef.current);
    urlTimerRef.current = window.setTimeout(() => {
      writeURLState(viewport, selectedEvent?.id, lanesEnabled);
    }, 500);
    return () => clearTimeout(urlTimerRef.current);
  }, [viewport, selectedEvent, lanesEnabled]);

  useEffect(() => {
    clearTimeout(discoverTimerRef.current);
    // Skip discovery during active animation to avoid burst API calls
    if (animRef.current) return;
    discoverTimerRef.current = window.setTimeout(() => {
      const result = discoverEvents(
        viewport.centerYear,
        viewport.span,
        existingTitlesRef.current,
        (newEvents) => {
          setDynamicEvents(prev => {
            const combined = [...prev, ...newEvents];
            // Cap at 2000 events — evict those farthest from current viewport
            if (combined.length > 2000) {
              const center = viewport.centerYear;
              return combined
                .sort((a, b) => Math.abs(a.year - center) - Math.abs(b.year - center))
                .slice(0, 2000);
            }
            return combined;
          });
          setCacheStats(getCacheStats());
        },
      );

      // Merge any already-cached events we haven't seen yet
      if (result.events.length > 0) {
        setDynamicEvents(prev => {
          const existingIds = new Set(prev.map(e => e.id));
          const fresh = result.events.filter(e => !existingIds.has(e.id));
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
      }

      setDiscovering(result.loading);
      setCacheStats(getCacheStats());
    }, 600); // debounce — wait for viewport to settle

    return () => clearTimeout(discoverTimerRef.current);
  }, [viewport.centerYear, viewport.span]);

  // Tour playback
  const playTourStop = useCallback((stops: TourStop[], idx: number) => {
    if (idx >= stops.length) {
      setTourStops(null);
      setTourPlaying(false);
      stopSpeech();
      return;
    }
    const stop = stops[idx];
    setTourIndex(idx);
    setTourPlaying(true);
    animateTo(stop.year, stop.span || viewport.span, 1800);

    if (voice) {
      setTimeout(() => {
        speak(stop.text, () => {
          tourTimerRef.current = window.setTimeout(() => playTourStop(stops, idx + 1), 800);
        });
      }, 1900);
    } else {
      const delay = Math.max(stop.text.length * 50, 4000) + 2000;
      tourTimerRef.current = window.setTimeout(() => playTourStop(stops, idx + 1), delay);
    }
  }, [animateTo, viewport.span, voice]);

  const handleStartTour = useCallback((stops: TourStop[]) => {
    setTourStops(stops);
    setTourIndex(0);
    playTourStop(stops, 0);
  }, [playTourStop]);

  const pauseTour = useCallback(() => {
    setTourPlaying(false);
    clearTimeout(tourTimerRef.current);
    stopSpeech();
  }, []);

  // Track event views for gamification
  const handleSelectEvent = useCallback((ev: TimelineEvent | null) => {
    setSelectedEvent(ev);
    if (ev) {
      recordEventView();
    }
  }, []);

  const resumeTour = useCallback(() => {
    if (tourStops) playTourStop(tourStops, tourIndex);
  }, [tourStops, tourIndex, playTourStop]);

  const skipTourStop = useCallback(() => {
    clearTimeout(tourTimerRef.current);
    stopSpeech();
    if (tourStops && tourIndex < tourStops.length - 1) {
      playTourStop(tourStops, tourIndex + 1);
    } else {
      setTourStops(null);
      setTourPlaying(false);
    }
  }, [tourStops, tourIndex, playTourStop]);

  const closeTour = useCallback(() => {
    clearTimeout(tourTimerRef.current);
    stopSpeech();
    setTourStops(null);
    setTourPlaying(false);
  }, []);

  // Keyboard help overlay
  const [showHelp, setShowHelp] = useState(false);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture keys when typing in an input or textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;

      const { centerYear, span } = viewport;
      const panStep = span * 0.1;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          setViewport({ centerYear: clamp(centerYear - panStep, -14e9, 2030), span });
          break;
        case 'ArrowRight':
          e.preventDefault();
          setViewport({ centerYear: clamp(centerYear + panStep, -14e9, 2030), span });
          break;
        case 'ArrowUp':
        case '+':
        case '=':
          e.preventDefault();
          setViewport({ centerYear, span: clamp(span / 1.3, 0.5, 3e10) });
          break;
        case 'ArrowDown':
        case '-':
          e.preventDefault();
          setViewport({ centerYear, span: clamp(span * 1.3, 0.5, 3e10) });
          break;
        case 'Escape':
          e.preventDefault();
          setSelectedEvent(null);
          setShowHelp(false);
          break;
        case '?':
          e.preventDefault();
          setShowHelp(prev => !prev);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [viewport]);

  // Chat-to-timeline: add events from AI conversation
  const handleAddEvents = useCallback((newEvents: TimelineEvent[]) => {
    setDynamicEvents(prev => {
      const existingTitles = new Set(prev.map(e => e.title));
      const fresh = newEvents.filter(e => !existingTitles.has(e.title));
      return fresh.length > 0 ? [...prev, ...fresh] : prev;
    });
  }, []);

  const toolBtnStyle = (label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{
        background: 'rgba(13, 17, 23, 0.9)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
        padding: '6px 14px',
        color: '#ffffff80',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        backdropFilter: 'blur(10px)',
        whiteSpace: 'nowrap' as const,
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="chronos-root">
      <TimelineCanvas
        viewport={viewport}
        events={allEvents}
        selectedId={selectedEvent?.id ?? null}
        activeLanes={lanesEnabled ? activeLanes : undefined}
        onViewportChange={setViewport}
        onSelectEvent={handleSelectEvent}
        onHoverEvent={setHoveredEvent}
      />

      <EraChips viewport={viewport} onNavigate={(y, s) => animateTo(y, s)} />

      {/* Lane toggle for parallel civilization comparison */}
      <LaneToggle
        lanesEnabled={lanesEnabled}
        onToggle={() => setLanesEnabled(!lanesEnabled)}
        activeLanes={activeLanes}
        onToggleLane={(id) => {
          setActiveLanes(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        }}
        onOpenComparison={() => setShowComparison(true)}
      />

      {/* Zoom level + discovery status + voice toggle */}
      <div className="top-right-controls">
        {discovering && (
          <span className="discover-badge">
            Discovering events...
          </span>
        )}
        <span className="zoom-badge">
          {scaleLabel(viewport.span)} · {formatYearShort(viewport.centerYear)}
        </span>
        <span className="cache-badge" title="Cached regions / total discovered events">
          {cacheStats.cells} regions · {cacheStats.events + ANCHOR_EVENTS.length} events
        </span>
        <button
          className={`voice-btn ${voice ? 'active' : ''}`}
          onClick={() => setVoice(!voice)}
          title={voice ? 'Voice on' : 'Voice off'}
        >
          {voice ? '🔊' : '🔇'}
        </button>
      </div>

      <ScrollHint />

      {selectedEvent && (
        <>
          <div className="overlay-backdrop" onClick={() => setSelectedEvent(null)} />
          <EventCard
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
            onAskGuide={(q) => {
              setSelectedEvent(null);
              setChatInitMsg(q);
            }}
          />
        </>
      )}

      <InsightsPanel viewport={viewport} visibleEvents={visibleEvents} />

      {/* Globe panel (lazy-loaded — Three.js is 500KB+) */}
      {showGlobe && (
        <Suspense fallback={null}>
        <GlobePanel
          events={visibleEvents}
          selectedEvent={selectedEvent}
          hoveredEvent={hoveredEvent}
          isCosmicScale={viewport.span > 1e8}
          currentYear={viewport.centerYear}
          onClose={() => setShowGlobe(false)}
        />
        </Suspense>
      )}
      {!showGlobe && (
        <button
          className="globe-toggle"
          onClick={() => setShowGlobe(true)}
          title="Show globe"
        >
          🌍
        </button>
      )}

      <Suspense fallback={null}>
        <ChatPanel
          viewport={viewport}
          visibleEvents={visibleEvents}
          selectedEvent={selectedEvent}
          onNavigate={(y, s) => animateTo(y, s)}
          onStartTour={handleStartTour}
          onAddEvents={handleAddEvents}
          initialMessage={chatInitMsg}
        />
      </Suspense>

      {showHelp && <KeyboardHelp onClose={() => setShowHelp(false)} />}

      {tourStops && (
        <TourOverlay
          stops={tourStops}
          currentIndex={tourIndex}
          playing={tourPlaying}
          onPause={pauseTour}
          onResume={resumeTour}
          onSkip={skipTourStop}
          onClose={closeTour}
        />
      )}

      {/* Comparison view */}
      {showComparison && (
        <Suspense fallback={null}>
          <ComparisonView
            viewport={viewport}
            events={allEvents}
            onClose={() => setShowComparison(false)}
            onSelectEvent={handleSelectEvent}
          />
        </Suspense>
      )}

      {/* Classroom mode */}
      {showClassroom && (
        <Suspense fallback={null}>
          <ClassroomMode
            viewport={viewport}
            onNavigate={(y, s) => animateTo(y, s)}
            onClose={() => setShowClassroom(false)}
          />
        </Suspense>
      )}

      {/* Current events panel */}
      {showCurrentEvents && (
        <Suspense fallback={null}>
          <CurrentEvents
            onNavigate={(y, s) => animateTo(y, s)}
            onAddEvents={handleAddEvents}
            onClose={() => setShowCurrentEvents(false)}
          />
        </Suspense>
      )}

      {/* Bottom toolbar — Classroom + Current Events */}
      <div style={{
        position: 'absolute',
        bottom: 20,
        left: '50%',
        transform: 'translateX(calc(-50% + 160px))',
        display: 'flex',
        gap: 6,
        zIndex: 20,
      }}>
        <button
          onClick={() => setShowCurrentEvents(true)}
          className="bottom-tool-btn"
          style={{
            background: 'rgba(13, 17, 23, 0.9)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            padding: '6px 14px',
            color: '#ffffff80',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            backdropFilter: 'blur(10px)',
            whiteSpace: 'nowrap',
          }}
        >
          🔗 History Repeats
        </button>
        {toolBtnStyle('🔍 Myth Buster', () => setShowMyths(true))}
        {toolBtnStyle('🧠 Quiz', () => setShowQuiz(true))}
        {toolBtnStyle('🎓 Classroom', () => setShowClassroom(true))}
        {toolBtnStyle('🔬 Lenses', () => setShowLenses(true))}
        {toolBtnStyle('👤 Account', () => setShowAuth(true))}
      </div>

      {/* Myth Buster */}
      {showMyths && (
        <Suspense fallback={null}>
          <MythBuster
            onNavigate={(y, s) => animateTo(y, s)}
            onAskAI={(q) => { setShowMyths(false); setChatInitMsg(q); }}
            centerYear={viewport.centerYear}
            span={viewport.span}
          />
        </Suspense>
      )}

      {/* Quiz */}
      {showQuiz && (
        <Suspense fallback={null}>
          <QuizPanel
            recentEvents={visibleEvents.slice(0, 10).map(e => e.title)}
            era={scaleLabel(viewport.span)}
          />
        </Suspense>
      )}

      {/* Knowledge Lenses */}
      {showLenses && (
        <Suspense fallback={null}>
          <LensExplorer
            onActivateLens={(lens) => { setActiveLens({ name: lens.name, emoji: lens.emoji, color: lens.color }); setShowLenses(false); }}
            onDeactivateLens={() => setActiveLens(null)}
            onClose={() => setShowLenses(false)}
          />
        </Suspense>
      )}

      {/* Active lens banner */}
      {activeLens && (
        <div style={{
          position: 'absolute',
          top: 50,
          left: '50%',
          transform: 'translateX(-50%)',
          background: `linear-gradient(90deg, ${activeLens.color}20, ${activeLens.color}10)`,
          border: `1px solid ${activeLens.color}30`,
          borderRadius: 12,
          padding: '6px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          zIndex: 20,
          backdropFilter: 'blur(10px)',
        }}>
          <span>{activeLens.emoji}</span>
          <span style={{ color: activeLens.color, fontSize: 12, fontWeight: 600 }}>{activeLens.name}</span>
          <button
            onClick={() => setActiveLens(null)}
            style={{ background: 'none', border: 'none', color: '#ffffff40', cursor: 'pointer', fontSize: 14, marginLeft: 4 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Auth */}
      {showAuth && (
        <>
          <div className="overlay-backdrop" onClick={() => setShowAuth(false)} />
          <Suspense fallback={null}>
            <AuthPanel onClose={() => setShowAuth(false)} />
          </Suspense>
        </>
      )}

      {/* Stats bar (self-managed state) */}
      <StatsBar />

      {/* Achievement toast (self-managed via gamification service) */}
      <AchievementToast />
    </div>
  );
}

function KeyboardHelp({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="overlay-backdrop" onClick={onClose} />
      <div className="keyboard-help" role="dialog" aria-label="Keyboard shortcuts">
        <h3>Keyboard Shortcuts</h3>
        <table>
          <tbody>
            <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Pan timeline left / right</td></tr>
            <tr><td><kbd>↑</kbd> <kbd>↓</kbd></td><td>Zoom in / out</td></tr>
            <tr><td><kbd>+</kbd> <kbd>-</kbd></td><td>Zoom in / out</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>Close panel / overlay</td></tr>
            <tr><td><kbd>?</kbd></td><td>Toggle this help</td></tr>
          </tbody>
        </table>
        <button className="keyboard-help-close" onClick={onClose}>Close</button>
      </div>
    </>
  );
}

function ScrollHint() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return (
    <div className="scroll-hint">
      <div>Scroll to zoom · Drag to pan · Click events to explore</div>
      <div className="scroll-hint-arrow">↕</div>
    </div>
  );
}
