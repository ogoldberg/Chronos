import { create } from 'zustand';

export type PanelId =
  | 'chat' | 'globe' | 'comparison' | 'classroom'
  | 'currentEvents' | 'myths' | 'quiz' | 'lenses'
  | 'auth' | 'search' | 'whatif' | 'personal' | 'help'
  | 'export' | 'timelapse' | 'debate'
  | 'teacher' | 'student'
  | 'community' | 'overlays'
  | 'collaboration'
  | 'today' | 'graph'
  | 'review' | 'figures' | 'reading' | 'sources' | 'difficulty'
  | 'places' | 'soundtrack'
  | null;

export type DifficultyLevel = 'kids' | 'standard' | 'advanced' | 'research';

interface UIState {
  // Panel management — only one panel open at a time (except globe)
  activePanel: PanelId;
  openPanel: (panel: PanelId) => void;
  closePanel: () => void;

  // Globe is independent (can be open alongside a panel)
  showGlobe: boolean;
  toggleGlobe: () => void;

  // Preferences
  voice: boolean;
  toggleVoice: () => void;

  // Lanes
  lanesEnabled: boolean;
  toggleLanes: () => void;
  activeLanes: Set<string>;
  toggleLane: (id: string) => void;

  // Parallel themed timelines — stacked tracks (science, art, war, …)
  // with convergence curves where events belong to more than one theme.
  // Mutually exclusive with region lanes: enabling one turns the other
  // off, since they both want to rewrite the canvas layout.
  themedTimelinesEnabled: boolean;
  toggleThemedTimelines: () => void;
  activeThemes: Set<string>;
  toggleActiveTheme: (id: string) => void;

  // Active lens
  activeLens: { name: string; emoji: string; color: string } | null;
  setActiveLens: (lens: UIState['activeLens']) => void;

  // Chat initial message (cross-panel trigger)
  chatInitMsg: string | undefined;
  setChatInitMsg: (msg: string | undefined) => void;

  // Difficulty level
  difficulty: DifficultyLevel;
  setDifficulty: (level: DifficultyLevel) => void;
}

const ALL_LANES = new Set(['europe', 'mideast', 'eastasia', 'southasia', 'africa', 'americas']);
// Default to all six themes on so the first glimpse of themed mode is the
// most interesting — seeing every thread side by side.
const ALL_THEMES = new Set(['science', 'art', 'war', 'power', 'tech', 'belief']);

export const useUIStore = create<UIState>((set) => ({
  activePanel: null,
  openPanel: (panel) => set({ activePanel: panel }),
  closePanel: () => set({ activePanel: null }),

  showGlobe: false,
  toggleGlobe: () => set(s => ({ showGlobe: !s.showGlobe })),

  voice: false,
  toggleVoice: () => set(s => ({ voice: !s.voice })),

  lanesEnabled: false,
  toggleLanes: () => set(s => ({
    lanesEnabled: !s.lanesEnabled,
    // Region lanes and themed timelines both rewrite the layout, so we
    // never let them run at the same time.
    themedTimelinesEnabled: s.lanesEnabled ? s.themedTimelinesEnabled : false,
  })),
  activeLanes: ALL_LANES,
  toggleLane: (id) => set(s => {
    const next = new Set(s.activeLanes);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { activeLanes: next };
  }),

  themedTimelinesEnabled: false,
  toggleThemedTimelines: () => set(s => ({
    themedTimelinesEnabled: !s.themedTimelinesEnabled,
    lanesEnabled: s.themedTimelinesEnabled ? s.lanesEnabled : false,
  })),
  activeThemes: ALL_THEMES,
  toggleActiveTheme: (id) => set(s => {
    const next = new Set(s.activeThemes);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { activeThemes: next };
  }),

  activeLens: null,
  setActiveLens: (lens) => set({ activeLens: lens }),

  chatInitMsg: undefined,
  setChatInitMsg: (msg) => set({ chatInitMsg: msg }),

  difficulty: (typeof localStorage !== 'undefined' ? localStorage.getItem('chronos_difficulty') as DifficultyLevel : null) || 'standard',
  setDifficulty: (level) => set({ difficulty: level }),
}));
