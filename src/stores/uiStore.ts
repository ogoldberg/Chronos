import { create } from 'zustand';
import type { TimelineTheme } from '../data/themes';

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

  // User-authored themed tracks — e.g. "Impact of mathematics on art" or
  // "History of the color blue". Persisted to localStorage so they
  // survive a reload. When active they also kick off AI discovery (see
  // useCustomThemeDiscovery) so the track fills in with topic-relevant
  // events the built-in dataset might not cover.
  customThemes: TimelineTheme[];
  addCustomTheme: (theme: TimelineTheme) => void;
  removeCustomTheme: (id: string) => void;
  updateCustomTheme: (id: string, patch: Partial<TimelineTheme>) => void;

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

const CUSTOM_THEMES_KEY = 'chronos_custom_themes_v1';

function loadCustomThemes(): TimelineTheme[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Narrow to the fields we care about — drop anything unexpected so a
    // malformed entry from an old version never crashes the renderer.
    return parsed
      .filter((t: unknown): t is Record<string, unknown> => !!t && typeof t === 'object')
      .map(t => ({
        id: String(t.id ?? ''),
        label: String(t.label ?? ''),
        emoji: String(t.emoji ?? '✨'),
        color: String(t.color ?? '#14b8a6'),
        tags: Array.isArray(t.tags) ? (t.tags as unknown[]).map(String) : [],
        description: typeof t.description === 'string' ? t.description : '',
        custom: true,
      }))
      .filter(t => t.id && t.label);
  } catch {
    return [];
  }
}

function saveCustomThemes(themes: TimelineTheme[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes));
  } catch {
    // Quota exceeded or JSON cycle — drop silently. Custom themes are
    // best-effort persistence; losing them is annoying, not fatal.
  }
}

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

  customThemes: loadCustomThemes(),
  addCustomTheme: (theme) => set(s => {
    // Replace-or-append: let the same id be re-saved after an edit.
    const next = s.customThemes.some(t => t.id === theme.id)
      ? s.customThemes.map(t => (t.id === theme.id ? theme : t))
      : [...s.customThemes, theme];
    saveCustomThemes(next);
    // New themes start enabled so the user sees their thread immediately.
    const activeThemes = new Set(s.activeThemes);
    activeThemes.add(theme.id);
    return { customThemes: next, activeThemes };
  }),
  removeCustomTheme: (id) => set(s => {
    const next = s.customThemes.filter(t => t.id !== id);
    saveCustomThemes(next);
    const activeThemes = new Set(s.activeThemes);
    activeThemes.delete(id);
    return { customThemes: next, activeThemes };
  }),
  updateCustomTheme: (id, patch) => set(s => {
    const next = s.customThemes.map(t => (t.id === id ? { ...t, ...patch, id, custom: true } : t));
    saveCustomThemes(next);
    return { customThemes: next };
  }),

  activeLens: null,
  setActiveLens: (lens) => set({ activeLens: lens }),

  chatInitMsg: undefined,
  setChatInitMsg: (msg) => set({ chatInitMsg: msg }),

  difficulty: (typeof localStorage !== 'undefined' ? localStorage.getItem('chronos_difficulty') as DifficultyLevel : null) || 'standard',
  setDifficulty: (level) => set({ difficulty: level }),
}));
