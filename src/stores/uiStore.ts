import { create } from 'zustand';

export type PanelId =
  | 'chat' | 'globe' | 'comparison' | 'classroom'
  | 'currentEvents' | 'myths' | 'quiz' | 'lenses'
  | 'auth' | 'search' | 'whatif' | 'personal' | 'help'
  | 'export' | 'timelapse' | 'debate'
  | 'teacher' | 'student'
  | 'community' | 'overlays'
  | 'community' | 'overlays'
  | null;

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

  // Active lens
  activeLens: { name: string; emoji: string; color: string } | null;
  setActiveLens: (lens: UIState['activeLens']) => void;

  // Chat initial message (cross-panel trigger)
  chatInitMsg: string | undefined;
  setChatInitMsg: (msg: string | undefined) => void;
}

const ALL_LANES = new Set(['europe', 'mideast', 'eastasia', 'southasia', 'africa', 'americas']);

export const useUIStore = create<UIState>((set) => ({
  activePanel: null,
  openPanel: (panel) => set({ activePanel: panel }),
  closePanel: () => set({ activePanel: null }),

  showGlobe: true,
  toggleGlobe: () => set(s => ({ showGlobe: !s.showGlobe })),

  voice: false,
  toggleVoice: () => set(s => ({ voice: !s.voice })),

  lanesEnabled: false,
  toggleLanes: () => set(s => ({ lanesEnabled: !s.lanesEnabled })),
  activeLanes: ALL_LANES,
  toggleLane: (id) => set(s => {
    const next = new Set(s.activeLanes);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { activeLanes: next };
  }),

  activeLens: null,
  setActiveLens: (lens) => set({ activeLens: lens }),

  chatInitMsg: undefined,
  setChatInitMsg: (msg) => set({ chatInitMsg: msg }),
}));
