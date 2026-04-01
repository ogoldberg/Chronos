import { useCallback, useRef, useEffect, useMemo, Suspense, lazy, useState } from 'react';
import { ANCHOR_EVENTS } from './data/anchorEvents';
import { clamp, formatYearShort, scaleLabel } from './utils/format';
import { getVisibleRange } from './canvas/viewport';
import { discoverEvents, getCacheStats } from './features/discovery/eventDiscovery';
import { writeURLState } from './utils/urlState';
import { recordEventView } from './features/gamification/gamification';
import { useTimelineStore, getAllEvents } from './stores/timelineStore';
import { useUIStore } from './stores/uiStore';
import { useTourStore } from './stores/tourStore';
import TimelineCanvas from './canvas/TimelineCanvas';
import EraChips from './components/EraChips';
import EventCard from './features/events/EventCard';
import InsightsPanel from './features/insights/InsightsPanel';
import TourOverlay from './features/tour/TourOverlay';
import LaneToggle from './features/comparison/LaneToggle';
import PanelRouter from './components/PanelRouter';
import StatsBar from './features/gamification/StatsBar';
import AchievementToast from './features/gamification/AchievementToast';
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
  const hoveredEvent = useTimelineStore(s => s.hoveredEvent);
  const setHoveredEvent = useTimelineStore(s => s.setHoveredEvent);
  const addEvents = useTimelineStore(s => s.addEvents);
  const setDiscovering = useTimelineStore(s => s.setDiscovering);
  const setCacheStats = useTimelineStore(s => s.setCacheStats);
  const discovering = useTimelineStore(s => s.discovering);
  const cacheStats = useTimelineStore(s => s.cacheStats);
  const allEvents = useTimelineStore(getAllEvents);

  const activePanel = useUIStore(s => s.activePanel);
  const openPanel = useUIStore(s => s.openPanel);
  const closePanel = useUIStore(s => s.closePanel);
  const voice = useUIStore(s => s.voice);
  const toggleVoice = useUIStore(s => s.toggleVoice);
  const showGlobe = useUIStore(s => s.showGlobe);
  const toggleGlobe = useUIStore(s => s.toggleGlobe);
  const lanesEnabled = useUIStore(s => s.lanesEnabled);
  const toggleLanes = useUIStore(s => s.toggleLanes);
  const activeLanes = useUIStore(s => s.activeLanes);
  const toggleLane = useUIStore(s => s.toggleLane);
  const activeLens = useUIStore(s => s.activeLens);
  const setActiveLens = useUIStore(s => s.setActiveLens);
  const setChatInitMsg = useUIStore(s => s.setChatInitMsg);

  const tourStops = useTourStore(s => s.stops);

  const animRef = useRef<number>(0);
  const discoverTimerRef = useRef<number>(0);
  const urlTimerRef = useRef<number>(0);
  const existingTitlesRef = useRef<Set<string>>(new Set());

  // Visible events
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
        case 'ArrowLeft': e.preventDefault(); setViewport(prev => ({ centerYear: clamp(prev.centerYear - prev.span * 0.1, -14e9, 2030), span: prev.span })); break;
        case 'ArrowRight': e.preventDefault(); setViewport(prev => ({ centerYear: clamp(prev.centerYear + prev.span * 0.1, -14e9, 2030), span: prev.span })); break;
        case 'ArrowUp': case '+': case '=': e.preventDefault(); setViewport(prev => ({ centerYear: prev.centerYear, span: clamp(prev.span / 1.3, 0.5, 3e10) })); break;
        case 'ArrowDown': case '-': e.preventDefault(); setViewport(prev => ({ centerYear: prev.centerYear, span: clamp(prev.span * 1.3, 0.5, 3e10) })); break;
        case 'Escape': e.preventDefault(); setSelectedEvent(null); closePanel(); break;
        case '?': e.preventDefault(); openPanel(activePanel === 'help' ? null : 'help'); break;
        case 'k': if (e.ctrlKey || e.metaKey) { e.preventDefault(); openPanel('search'); } break;
        case '/': if (!e.ctrlKey) { e.preventDefault(); openPanel('search'); } break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setViewport, setSelectedEvent, closePanel, openPanel, activePanel]);

  // Track event views
  const handleSelectEvent = useCallback((ev: TimelineEvent | null) => {
    setSelectedEvent(ev);
    if (ev) recordEventView();
  }, [setSelectedEvent]);

  // Toolbar button helper
  const toolBtn = (label: string, panel: NonNullable<typeof activePanel>) => (
    <button
      key={panel}
      onClick={() => openPanel(panel)}
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

      <LaneToggle
        lanesEnabled={lanesEnabled}
        onToggle={toggleLanes}
        activeLanes={activeLanes}
        onToggleLane={toggleLane}
        onOpenComparison={() => openPanel('comparison')}
      />

      {/* Top right controls */}
      <div className="top-right-controls">
        {discovering && <span className="discover-badge">Discovering...</span>}
        <span className="zoom-badge">{scaleLabel(viewport.span)} · {formatYearShort(viewport.centerYear)}</span>
        <span className="cache-badge">{cacheStats.cells} regions · {cacheStats.events + ANCHOR_EVENTS.length} events</span>
        <button className={`voice-btn ${voice ? 'active' : ''}`} onClick={toggleVoice}>
          {voice ? '🔊' : '🔇'}
        </button>
      </div>

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
          />
        </Suspense>
      )}
      {!showGlobe && (
        <button className="globe-toggle" onClick={toggleGlobe} title="Show globe">🌍</button>
      )}

      {/* Active lens banner */}
      {activeLens && (
        <div style={{
          position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)',
          background: `linear-gradient(90deg, ${activeLens.color}20, ${activeLens.color}10)`,
          border: `1px solid ${activeLens.color}30`, borderRadius: 12,
          padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8,
          zIndex: 20, backdropFilter: 'blur(10px)',
        }}>
          <span>{activeLens.emoji}</span>
          <span style={{ color: activeLens.color, fontSize: 12, fontWeight: 600 }}>{activeLens.name}</span>
          <button onClick={() => setActiveLens(null)} style={{ background: 'none', border: 'none', color: '#ffffff40', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
      )}

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

      {/* Bottom toolbar */}
      <div style={{
        position: 'absolute', bottom: 20, left: '50%',
        transform: 'translateX(calc(-50% + 140px))',
        display: 'flex', gap: 6, zIndex: 20, flexWrap: 'wrap',
      }}>
        {toolBtn('💬 Chat', 'chat')}
        {toolBtn('🔗 Parallels', 'currentEvents')}
        {toolBtn('🔍 Myths', 'myths')}
        {toolBtn('🧠 Quiz', 'quiz')}
        {toolBtn('🔬 Lenses', 'lenses')}
        {toolBtn('🎓 Classroom', 'classroom')}
        {toolBtn('👩‍🏫 Teach', 'teacher')}
        {toolBtn('📅 My Life', 'personal')}
        {toolBtn('🔮 What If', 'whatif')}
        {toolBtn('⏩ Time-lapse', 'timelapse')}
        {toolBtn('⚖️ Debate', 'debate')}
        {toolBtn('🌐 Community', 'community')}
        {toolBtn('🤝 Collab', 'collaboration')}
        {toolBtn('📊 Data', 'overlays')}
        {toolBtn('📤 Export', 'export')}
        {toolBtn('👤 Account', 'auth')}
      </div>

      <StatsBar />
      <AchievementToast />

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
      <div>Scroll to zoom · Drag to pan · Click events to explore</div>
      <div className="scroll-hint-arrow">↕</div>
    </div>
  );
}
