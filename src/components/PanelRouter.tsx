import { lazy, Suspense } from 'react';
import { useUIStore, type PanelId } from '../stores/uiStore';
import { useTimelineStore, getAllEvents } from '../stores/timelineStore';
import { useTourStore } from '../stores/tourStore';
import { scaleLabel } from '../utils/format';
import { getVisibleRange } from '../canvas/viewport';

// Lazy-loaded panels
const ChatPanel = lazy(() => import('./ChatPanel'));
const ComparisonView = lazy(() => import('./ComparisonView'));
const ClassroomMode = lazy(() => import('./ClassroomMode'));
const CurrentEvents = lazy(() => import('./CurrentEvents'));
const MythBuster = lazy(() => import('./MythBuster'));
const QuizPanel = lazy(() => import('./QuizPanel'));
const LensExplorer = lazy(() => import('./LensExplorer'));
const AuthPanel = lazy(() => import('./AuthPanel'));
const SearchPanel = lazy(() => import('./SearchPanel'));
const WhatIfPanel = lazy(() => import('./WhatIfPanel'));
const PersonalTimeline = lazy(() => import('./PersonalTimeline'));

export default function PanelRouter() {
  const activePanel = useUIStore(s => s.activePanel);
  const closePanel = useUIStore(s => s.closePanel);
  const setChatInitMsg = useUIStore(s => s.setChatInitMsg);
  const chatInitMsg = useUIStore(s => s.chatInitMsg);
  const setActiveLens = useUIStore(s => s.setActiveLens);

  const viewport = useTimelineStore(s => s.viewport);
  const selectedEvent = useTimelineStore(s => s.selectedEvent);
  const setViewport = useTimelineStore(s => s.setViewport);
  const addEvents = useTimelineStore(s => s.addEvents);
  const allEvents = useTimelineStore(getAllEvents);

  const startTour = useTourStore(s => s.startTour);

  const [left, right] = getVisibleRange(viewport);
  const visibleEvents = allEvents.filter(ev => {
    if (ev.year < left || ev.year > right) return false;
    if (ev.maxSpan && viewport.span > ev.maxSpan) return false;
    return true;
  });

  const animateTo = (year: number, span: number) => {
    // Simple instant navigation — animation handled by caller if needed
    setViewport({ centerYear: year, span });
  };

  if (!activePanel) return null;

  return (
    <Suspense fallback={null}>
      {activePanel === 'chat' && (
        <ChatPanel
          viewport={viewport}
          visibleEvents={visibleEvents}
          selectedEvent={selectedEvent}
          onNavigate={animateTo}
          onStartTour={startTour}
          onAddEvents={addEvents}
          initialMessage={chatInitMsg}
        />
      )}
      {activePanel === 'comparison' && (
        <ComparisonView
          viewport={viewport}
          events={allEvents}
          onClose={closePanel}
          onSelectEvent={useTimelineStore.getState().setSelectedEvent}
        />
      )}
      {activePanel === 'classroom' && (
        <ClassroomMode
          viewport={viewport}
          onNavigate={animateTo}
          onClose={closePanel}
        />
      )}
      {activePanel === 'currentEvents' && (
        <CurrentEvents
          onNavigate={animateTo}
          onAddEvents={addEvents}
          onClose={closePanel}
        />
      )}
      {activePanel === 'myths' && (
        <MythBuster
          onNavigate={animateTo}
          onAskAI={(q) => { setChatInitMsg(q); useUIStore.getState().openPanel('chat'); }}
          onClose={closePanel}
          centerYear={viewport.centerYear}
          span={viewport.span}
        />
      )}
      {activePanel === 'quiz' && (
        <QuizPanel
          recentEvents={visibleEvents.slice(0, 10).map(e => e.title)}
          era={scaleLabel(viewport.span)}
          onClose={closePanel}
        />
      )}
      {activePanel === 'lenses' && (
        <LensExplorer
          onActivateLens={(lens) => { setActiveLens({ name: lens.name, emoji: lens.emoji, color: lens.color }); closePanel(); }}
          onDeactivateLens={() => setActiveLens(null)}
          onClose={closePanel}
        />
      )}
      {activePanel === 'auth' && (
        <>
          <div className="overlay-backdrop" onClick={closePanel} />
          <AuthPanel onClose={closePanel} />
        </>
      )}
      {activePanel === 'search' && (
        <SearchPanel
          onNavigate={animateTo}
          onSelectEvent={useTimelineStore.getState().setSelectedEvent}
          onClose={closePanel}
        />
      )}
      {activePanel === 'whatif' && (
        <WhatIfPanel
          onNavigate={animateTo}
          onClose={closePanel}
        />
      )}
      {activePanel === 'personal' && (
        <PersonalTimeline
          onAddEvents={addEvents}
          onClose={closePanel}
        />
      )}
      {activePanel === 'help' && (
        <KeyboardHelpInline onClose={closePanel} />
      )}
    </Suspense>
  );
}

function KeyboardHelpInline({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="overlay-backdrop" onClick={onClose} />
      <div className="keyboard-help" role="dialog" aria-label="Keyboard shortcuts">
        <h3>Keyboard Shortcuts</h3>
        <table>
          <tbody>
            <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Pan timeline</td></tr>
            <tr><td><kbd>↑</kbd> <kbd>↓</kbd></td><td>Zoom in / out</td></tr>
            <tr><td><kbd>+</kbd> <kbd>-</kbd></td><td>Zoom in / out</td></tr>
            <tr><td><kbd>Ctrl+K</kbd></td><td>Search</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>Close panel</td></tr>
            <tr><td><kbd>?</kbd></td><td>Toggle this help</td></tr>
          </tbody>
        </table>
        <button className="keyboard-help-close" onClick={onClose}>Close</button>
      </div>
    </>
  );
}
