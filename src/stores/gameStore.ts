import { create } from 'zustand';
import {
  getStats,
  recordEventView,
  recordQuizAnswer,
  recordMythRevealed,
  subscribe,
  type PlayerStats,
} from '../features/gamification/gamification';

interface GameState {
  stats: PlayerStats;
  trackEventView: (eraId?: string, continent?: string) => void;
  trackQuizAnswer: (correct: boolean) => void;
  trackMythRevealed: () => void;
}

export const useGameStore = create<GameState>((set) => {
  // Subscribe to gamification service updates
  subscribe((stats) => set({ stats }));

  return {
    stats: getStats(),
    trackEventView: (eraId, continent) => {
      const updated = recordEventView(eraId, continent);
      set({ stats: updated });
    },
    trackQuizAnswer: (correct) => {
      const updated = recordQuizAnswer(correct);
      set({ stats: updated });
    },
    trackMythRevealed: () => {
      const updated = recordMythRevealed();
      set({ stats: updated });
    },
  };
});
