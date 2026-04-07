import { useCallback, useRef, useEffect, useMemo, Suspense, lazy, useState } from 'react';
import { isEventVisible, clampViewport } from './canvas/viewport';
import { discoverEvents, getCacheStats } from './features/discovery/eventDiscovery';
import { writeURLState } from './utils/urlState';
import { recordEventView } from './features/gamification/gamification';
import { useTimelineStore, getAllEvents } from './stores/timelineStore';
import { useUIStore } from './stores/uiStore';
import { useTourStore } from './stores/tourStore';
import TimelineCanvas from './canvas/TimelineCanvas';
import EditorialHeader from './components/EditorialHeader';
import CommandPalette from './components/CommandPalette';
import EventCard from './features/events/EventCard';
import PeriodCard from './features/period/PeriodCard';
import DatePickerPopover from './components/DatePickerPopover';
import InsightsPanel from './features/insights/InsightsPanel';
import TourOverlay from './features/tour/TourOverlay';
import PanelRouter from './components/PanelRouter';
import OnboardingOverlay, { triggerOnboarding, ShowMeAroundButton } from './features/onboarding/OnboardingOverlay';
import CursorOverlay from './features/collaboration/CursorOverlay';
import type { TimelineEvent } from './types';
import './App.css';

const GlobePanel = lazy(() => import('./features/globe/GlobePanel'));

export default function App() {
  // Store subscriptions
  const viewport = useTimelineStore(s => s.viewport);
  const setViewport = useTimelineStore(s => s.setViewport);
  const selectedEvent = useTimelineStore(s => s.selectedEvent);
  const setSelectedEvent = useTimelineStore(s => s.setSelectedEvent);
  const selectedPeriod = useTimelineStore(s => s.selectedPeriod);
  const setSelectedPeriod = useTimelineStore(s => s.setSelectedPeriod);
  const hoveredEvent = useTimelineStore(s => s.hoveredEvent);
  const setHoveredEvent = useTimelineStore(s => s.setHoveredEvent);
  const addEvents = useTimelineStore(s => s.addEvents);
  const setDiscovering = useTimelineStore(s => s.setDiscovering);
  const setCacheStats = useTimelineStore(s => s.setCacheStats);
  const allEvents = useTimelineStore(getAllEvents);

  const activePanel = useUIStore(s => s.activePanel);
  const openPanel = useUIStore(s => s.openPanel);
  const closePanel = useUIStore(s => s.closePanel);
  const showGlobe = useUIStore(s => s.showGlobe);
  const toggleGlobe = useUIStore(s => s.toggleGlobe);
  const lanesEnabled = useUIStore(s => s.lanesEnabled);
  const activeLanes = useUIStore(s => s.activeLanes);
  const setChatInitMsg = useUIStore(s => s.setChatInitMsg);

  const tourStops = useTourStore(s => s.stops);

  const animRef = useRef<number>(0);
  const discoverTimerRef = useRef<number>(0);
  const urlTimerRef = useRef<number>(0);
  const existingTitlesRef = useRef<Set<string>>(new Set());
  // Whether the date/period picker popover is open. Triggered by clicking
  // the era/year text in the editorial header.
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  // Whether the ⌘K command palette is open. Triggered by ⌘K, the header
  // Search button, or the legacy '/' shortcut.
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Visible events
  const visibleEvents = useMemo(
    () => allEvents.filter(ev => isEventVisible(ev, viewport)),
    [allEvents, viewport],
  );

  // Animated navigation
  const animateTo = useCallback((targetYear: number, targetSpan: number, duration = 1500) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const startYear = viewport.centerYear;
    const startSpan = viewport.span;
    const t0 = performance.now();
    function step(now: number) {
      const t = Math.min((now - t0) / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      setViewport(clampViewport({
        centerYear: startYear + (targetYear - startYear) * ease,
        span: startSpan + (targetSpan - startSpan) * ease,
      }));
      if (t < 1) animRef.current = requestAnimationFrame(step);
      else animRef.current = 0;
    }
    animRef.current = requestAnimationFrame(step);
  }, [viewport, setViewport]);

  // Sync existing titles
  useEffect(() => {
    existingTitlesRef.current = new Set(allEvents.map(e => e.title));
  }, [allEvents]);

  // URL sync
  useEffect(() => {
    clearTimeout(urlTimerRef.current);
    urlTimerRef.current = window.setTimeout(() => {
      writeURLState(viewport, selectedEvent?.id, lanesEnabled);
    }, 500);
    return () => clearTimeout(urlTimerRef.current);
  }, [viewport, selectedEvent, lanesEnabled]);

  // Event discovery
  useEffect(() => {
    clearTimeout(discoverTimerRef.current);
    if (animRef.current) return;
    discoverTimerRef.current = window.setTimeout(() => {
      const result = discoverEvents(
        viewport.centerYear, viewport.span, existingTitlesRef.current,
        (newEvents) => { addEvents(newEvents); setCacheStats(getCacheStats()); },
      );
      if (result.events.length > 0) {
        const existingIds = new Set(useTimelineStore.getState().dynamicEvents.map(e => e.id));
        const fresh = result.events.filter(e => !existingIds.has(e.id));
        if (fresh.length > 0) addEvents(fresh);
      }
      setDiscovering(result.loading);
      setCacheStats(getCacheStats());
    }, 600);
    return () => clearTimeout(discoverTimerRef.current);
  }, [viewport.centerYear, viewport.span, addEvents, setDiscovering, setCacheStats]);

  // Keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); setViewport(prev => clampViewport({ centerYear: prev.centerYear - prev.span * 0.1, span: prev.span })); break;
        case 'ArrowRight': e.preventDefault(); setViewport(prev => clampViewport({ centerYear: prev.centerYear + prev.span * 0.1, span: prev.span })); break;
        case 'ArrowUp': case '+': case '=': e.preventDefault(); setViewport(prev => clampViewport({ centerYear: prev.centerYear, span: prev.span / 1.3 })); break;
        case 'ArrowDown': case '-': e.preventDefault(); setViewport(prev => clampViewport({ centerYear: prev.centerYear, span: prev.span * 1.3 })); break;
        case 'Escape': e.preventDefault(); setSelectedEvent(null); setSelectedPeriod(null); closePanel(); break;
        case '?': e.preventDefault(); openPanel(activePanel === 'help' ? null : 'help'); break;
        case 'k': if (e.ctrlKey || e.metaKey) { e.preventDefault(); setPaletteOpen(true); } break;
        case '/': if (!e.ctrlKey) { e.preventDefault(); setPaletteOpen(true); } break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setViewport, setSelectedEvent, setSelectedPeriod, closePanel, openPanel, activePanel]);

  // Track event views
  const handleSelectEvent = useCallback((ev: TimelineEvent | null) => {
    setSelectedEvent(ev);
    if (ev) recordEventView();
  }, [setSelectedEvent]);

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
        onSelectPeriod={(year) => setSelectedPeriod({ year, span: viewport.span })}
      />

      {/*
        Editorial header — the only chrome pinned to the top of the canvas.
        Wordmark, era/year indicator, and the ⌘K affordance. The era chip
        row and the 27-button bottom toolbar from the previous design are
        gone; everything they exposed lives in the command palette now.
      */}
      <EditorialHeader
        viewport={viewport}
        onOpenDatePicker={() => setDatePickerOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      {/* First-run hint — auto-hides after 5 seconds. */}
      <ScrollHint />

      {/* Event card */}
      {selectedEvent && (
        <>
          <div className="overlay-backdrop" onClick={() => setSelectedEvent(null)} />
          <EventCard
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
            onAskGuide={(q) => { setSelectedEvent(null); setChatInitMsg(q); openPanel('chat'); }}
          />
        </>
      )}

      {/* Date/period picker — triggered by clicking the zoom badge */}
      {datePickerOpen && (
        <DatePickerPopover
          viewport={viewport}
          onNavigate={(y, s) => {
            // Navigate to the chosen year, then immediately open a period
            // card so the user gets context for *where* they just landed
            // (otherwise jumping to e.g. 1453 would just leave them
            // staring at an empty timeline if no events sit at exactly
            // that year).
            animateTo(y, s);
            setSelectedPeriod({ year: y, span: s });
          }}
          onClose={() => setDatePickerOpen(false)}
        />
      )}

      {/* Period card — opens when the user clicks an empty point on the timeline */}
      {selectedPeriod && (
        <PeriodCard
          year={selectedPeriod.year}
          viewportSpan={selectedPeriod.span}
          allEvents={allEvents}
          onClose={() => setSelectedPeriod(null)}
          onZoomIn={(y, s) => { setSelectedPeriod(null); animateTo(y, s); }}
          onSelectEvent={(ev) => { setSelectedPeriod(null); handleSelectEvent(ev); }}
          onAskGuide={(q) => { setSelectedPeriod(null); setChatInitMsg(q); openPanel('chat'); }}
        />
      )}

      <InsightsPanel viewport={viewport} visibleEvents={visibleEvents} />

      {/* Globe */}
      {showGlobe && (
        <Suspense fallback={null}>
          <GlobePanel
            events={visibleEvents}
            selectedEvent={selectedEvent}
            hoveredEvent={hoveredEvent}
            isCosmicScale={viewport.span > 1e8}
            currentYear={viewport.centerYear}
            onClose={toggleGlobe}
            onAskGuide={(q) => { setChatInitMsg(q); openPanel('chat'); }}
          />
        </Suspense>
      )}
      {/* The globe-toggle floating button and the active-lens banner were
          removed: both actions are now reachable from the command palette,
          and the active lens shows up muted in the editorial header. */}

      {/* Cursor overlay for collaboration */}
      <CursorOverlay />

      {/* Panel router — handles all lazy-loaded panels */}
      <PanelRouter />

      {/* Tour overlay */}
      {tourStops && (
        <TourOverlay
          stops={tourStops}
          currentIndex={useTourStore.getState().currentIndex}
          playing={useTourStore.getState().playing}
          onPause={useTourStore.getState().pause}
          onResume={useTourStore.getState().resume}
          onSkip={useTourStore.getState().skip}
          onClose={useTourStore.getState().close}
        />
      )}

      {/* Command palette — replaces the 27-button bottom toolbar */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        openPanel={openPanel}
        toggleGlobe={toggleGlobe}
        openDatePicker={() => setDatePickerOpen(true)}
      />

      {/* "Show me around" button — visible when help overlay is open */}
      {activePanel === 'help' && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, calc(-50% + 140px))',
          zIndex: 2001,
        }}>
          <ShowMeAroundButton onClick={() => { closePanel(); triggerOnboarding(); }} />
        </div>
      )}

      {/* Onboarding overlay — not lazy, shows on first visit */}
      <OnboardingOverlay />
    </div>
  );
}

function ScrollHint() {
  const [visible, setVisible] = useState(true);
  useEffect(() => { const t = setTimeout(() => setVisible(false), 5000); return () => clearTimeout(t); }, []);
  if (!visible) return null;
  return (
    <div className="scroll-hint">
      <div>Scroll to zoom &middot; Drag to pan &middot; Click events to explore</div>
      <div className="scroll-hint-arrow">&#x2195;</div>
    </div>
  );
}
