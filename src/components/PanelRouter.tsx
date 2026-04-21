import { lazy, Suspense } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useTimelineStore, getAllEvents } from '../stores/timelineStore';
import { useTourStore } from '../stores/tourStore';
import { scaleLabel } from '../utils/format';
import { isEventVisible } from '../canvas/viewport';

// Lazy-loaded panels
const ChatPanel = lazy(() => import('../features/chat/ChatPanel'));
const ComparisonView = lazy(() => import('../features/comparison/ComparisonView'));
const ClassroomMode = lazy(() => import('../features/classroom/ClassroomMode'));
const CurrentEvents = lazy(() => import('../features/parallels/CurrentEvents'));
const MythBuster = lazy(() => import('../features/myths/MythBuster'));
const QuizPanel = lazy(() => import('../features/gamification/QuizPanel'));
const LensExplorer = lazy(() => import('../features/lenses/LensExplorer'));
const AuthPanel = lazy(() => import('../features/auth/AuthPanel'));
const SearchPanel = lazy(() => import('../features/search/SearchPanel'));
const WhatIfPanel = lazy(() => import('../features/whatif/WhatIfPanel'));
const PersonalTimeline = lazy(() => import('../features/personal/PersonalTimeline'));
const ExportPanel = lazy(() => import('../features/export/ExportPanel'));
const TimeLapse = lazy(() => import('../features/timelapse/TimeLapse'));
const DebatePanel = lazy(() => import('../features/debate/DebatePanel'));
const CommunityHub = lazy(() => import('../features/community/CommunityHub'));
const DataOverlays = lazy(() => import('../features/overlays/DataOverlays'));
const TeacherDashboard = lazy(() => import('../features/classroom/TeacherDashboard'));
const StudentView = lazy(() => import('../features/classroom/StudentView'));
const CollaborationPanel = lazy(() => import('../features/collaboration/CollaborationPanel'));
const TodayInHistory = lazy(() => import('../features/today/TodayInHistory'));
const ConnectionGraph = lazy(() => import('../features/graph/ConnectionGraph'));
const ReviewPanel = lazy(() => import('../features/gamification/ReviewPanel'));
const FigureChat = lazy(() => import('../features/figures/FigureChat'));
const ReadingList = lazy(() => import('../features/reading/ReadingList'));
const SourceComparison = lazy(() => import('../features/sources/SourceComparison'));
const DifficultySelector = lazy(() => import('../features/settings/DifficultySelector'));
const HistoryOfPlace = lazy(() => import('../features/places/HistoryOfPlace'));
const HistorySoundtrack = lazy(() => import('../features/soundtrack/HistorySoundtrack'));

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

  const visibleEvents = allEvents.filter(ev => isEventVisible(ev, viewport));

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
          onClose={closePanel}
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
      {activePanel === 'export' && (
        <ExportPanel
          viewport={viewport}
          events={visibleEvents}
          onClose={closePanel}
        />
      )}
      {activePanel === 'timelapse' && (
        <TimeLapse
          onNavigate={animateTo}
          onClose={closePanel}
          currentYear={viewport.centerYear}
        />
      )}
      {activePanel === 'debate' && (
        <DebatePanel
          onNavigate={animateTo}
          onClose={closePanel}
        />
      )}
      {activePanel === 'community' && (
        <CommunityHub
          onClose={closePanel}
        />
      )}
      {activePanel === 'overlays' && (
        <DataOverlays />
      )}
      {activePanel === 'teacher' && (
        <TeacherDashboard onClose={closePanel} />
      )}
      {activePanel === 'student' && (
        <StudentView onClose={closePanel} />
      )}
      {activePanel === 'collaboration' && (
        <CollaborationPanel />
      )}
      {activePanel === 'today' && (
        <TodayInHistory
          onNavigate={animateTo}
          onClose={closePanel}
        />
      )}
      {activePanel === 'graph' && (
        <ConnectionGraph
          onNavigate={animateTo}
          onClose={closePanel}
          events={allEvents}
        />
      )}
      {activePanel === 'review' && (
        <ReviewPanel onClose={closePanel} />
      )}
      {activePanel === 'figures' && (
        <FigureChat onNavigate={animateTo} onClose={closePanel} />
      )}
      {activePanel === 'reading' && (
        <ReadingList onClose={closePanel} viewport={viewport} />
      )}
      {activePanel === 'sources' && (
        <SourceComparison onNavigate={animateTo} onClose={closePanel} />
      )}
      {activePanel === 'difficulty' && (
        <DifficultySelector onClose={closePanel} />
      )}
      {activePanel === 'places' && (
        <HistoryOfPlace onNavigate={animateTo} onClose={closePanel} />
      )}
      {activePanel === 'soundtrack' && (
        <HistorySoundtrack currentYear={viewport.centerYear} onClose={closePanel} />
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
