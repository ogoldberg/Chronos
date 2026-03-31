import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { TimelineEvent, Viewport, TourStop } from './types';
import { ANCHOR_EVENTS } from './data/anchorEvents';
import { clamp, formatYearShort, scaleLabel } from './utils/format';
import { getVisibleRange } from './canvas/viewport';
import { speak, stopSpeech } from './utils/speech';
import TimelineCanvas from './canvas/TimelineCanvas';
import EraChips from './components/EraChips';
import EventCard from './components/EventCard';
import InsightsPanel from './components/InsightsPanel';
import ChatPanel from './components/ChatPanel';
import TourOverlay from './components/TourOverlay';
import './App.css';

export default function App() {
  const [viewport, setViewport] = useState<Viewport>({ centerYear: -4e9, span: 2.8e10 });
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [, setHoveredEvent] = useState<TimelineEvent | null>(null);
  const [dynamicEvents, setDynamicEvents] = useState<TimelineEvent[]>([]);
  const [discoveredRegions, setDiscoveredRegions] = useState<Set<string>>(new Set());
  const [chatInitMsg, setChatInitMsg] = useState<string | undefined>();
  const [voice, setVoice] = useState(false);

  // Tour state
  const [tourStops, setTourStops] = useState<TourStop[] | null>(null);
  const [tourIndex, setTourIndex] = useState(0);
  const [tourPlaying, setTourPlaying] = useState(false);
  const tourTimerRef = useRef<number>(0);
  const animRef = useRef<number>(0);

  // All events combined
  const allEvents = useMemo(
    () => [...ANCHOR_EVENTS, ...dynamicEvents],
    [dynamicEvents]
  );

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

  // Dynamic event discovery
  const discoverTimerRef = useRef<number>(0);
  useEffect(() => {
    if (viewport.span > 1e8) return;

    const [left, right] = getVisibleRange(viewport);
    const regionKey = `${Math.round(left / (viewport.span * 0.5))}_${Math.round(viewport.span)}`;
    if (discoveredRegions.has(regionKey)) return;

    clearTimeout(discoverTimerRef.current);
    discoverTimerRef.current = window.setTimeout(async () => {
      try {
        const existingTitles = allEvents
          .filter(e => e.year >= left && e.year <= right)
          .map(e => e.title);

        const resp = await fetch('/api/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startYear: Math.round(left),
            endYear: Math.round(right),
            existingTitles,
            count: 6,
          }),
        });
        const data = await resp.json();
        if (data.events?.length) {
          const newEvents: TimelineEvent[] = data.events.map((e: any, i: number) => ({
            id: `d-${Date.now()}-${i}`,
            title: e.title,
            year: e.year,
            emoji: e.emoji || '📌',
            color: e.color || '#888',
            description: e.description,
            category: e.category || 'civilization',
            source: 'discovered' as const,
            wiki: e.wiki,
          }));
          setDynamicEvents(prev => [...prev, ...newEvents]);
          setDiscoveredRegions(prev => new Set(prev).add(regionKey));
        }
      } catch {
        // Silently fail
      }
    }, 1200);

    return () => clearTimeout(discoverTimerRef.current);
  }, [viewport, allEvents, discoveredRegions]);

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

  return (
    <div className="chronos-root">
      <TimelineCanvas
        viewport={viewport}
        events={allEvents}
        selectedId={selectedEvent?.id ?? null}
        onViewportChange={setViewport}
        onSelectEvent={setSelectedEvent}
        onHoverEvent={setHoveredEvent}
      />

      <EraChips viewport={viewport} onNavigate={(y, s) => animateTo(y, s)} />

      {/* Zoom level + voice toggle */}
      <div className="top-right-controls">
        <span className="zoom-badge">
          {scaleLabel(viewport.span)} · {formatYearShort(viewport.centerYear)}
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

      <ChatPanel
        viewport={viewport}
        visibleEvents={visibleEvents}
        selectedEvent={selectedEvent}
        onNavigate={(y, s) => animateTo(y, s)}
        onStartTour={handleStartTour}
        initialMessage={chatInitMsg}
      />

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
    </div>
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
