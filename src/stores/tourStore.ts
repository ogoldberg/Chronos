import { create } from 'zustand';
import type { TourStop } from '../types';
import { stopSpeech } from '../utils/speech';

interface TourState {
  stops: TourStop[] | null;
  currentIndex: number;
  playing: boolean;

  startTour: (stops: TourStop[]) => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  close: () => void;

  // Internal
  _timerId: number;
}

export const useTourStore = create<TourState>((set, get) => ({
  stops: null,
  currentIndex: 0,
  playing: false,
  _timerId: 0,

  startTour: (stops) => {
    set({ stops, currentIndex: 0, playing: true });
  },

  pause: () => {
    clearTimeout(get()._timerId);
    stopSpeech();
    set({ playing: false });
  },

  resume: () => {
    set({ playing: true });
  },

  skip: () => {
    clearTimeout(get()._timerId);
    stopSpeech();
    const { stops, currentIndex } = get();
    if (stops && currentIndex < stops.length - 1) {
      set({ currentIndex: currentIndex + 1 });
    } else {
      set({ stops: null, playing: false, currentIndex: 0 });
    }
  },

  close: () => {
    clearTimeout(get()._timerId);
    stopSpeech();
    set({ stops: null, playing: false, currentIndex: 0 });
  },
}));
