import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock window.speechSynthesis for Node environment
vi.stubGlobal('window', { speechSynthesis: { cancel: vi.fn(), speak: vi.fn(), getVoices: () => [] } });
vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn(), getVoices: () => [] });

import { useTourStore } from '../tourStore';

describe('tourStore', () => {
  beforeEach(() => {
    useTourStore.setState({ stops: null, currentIndex: 0, playing: false });
  });

  it('starts with no tour', () => {
    const state = useTourStore.getState();
    expect(state.stops).toBeNull();
    expect(state.playing).toBe(false);
    expect(state.currentIndex).toBe(0);
  });

  it('startTour sets stops and playing', () => {
    const stops = [
      { year: 1776, span: 50, text: 'American Independence' },
      { year: 1789, span: 30, text: 'French Revolution' },
    ];
    useTourStore.getState().startTour(stops);
    const state = useTourStore.getState();
    expect(state.stops).toEqual(stops);
    expect(state.playing).toBe(true);
    expect(state.currentIndex).toBe(0);
  });

  it('pause stops playing', () => {
    useTourStore.getState().startTour([{ year: 1776, span: 50, text: 'Test' }]);
    useTourStore.getState().pause();
    expect(useTourStore.getState().playing).toBe(false);
  });

  it('skip advances to next stop', () => {
    const stops = [
      { year: 1776, span: 50, text: 'Stop 1' },
      { year: 1789, span: 30, text: 'Stop 2' },
      { year: 1800, span: 20, text: 'Stop 3' },
    ];
    useTourStore.getState().startTour(stops);
    useTourStore.getState().skip();
    expect(useTourStore.getState().currentIndex).toBe(1);
  });

  it('skip on last stop closes tour', () => {
    useTourStore.getState().startTour([{ year: 1776, span: 50, text: 'Only stop' }]);
    useTourStore.getState().skip();
    expect(useTourStore.getState().stops).toBeNull();
    expect(useTourStore.getState().playing).toBe(false);
  });

  it('close resets everything', () => {
    useTourStore.getState().startTour([
      { year: 1776, span: 50, text: 'Stop 1' },
      { year: 1789, span: 30, text: 'Stop 2' },
    ]);
    useTourStore.getState().close();
    expect(useTourStore.getState().stops).toBeNull();
    expect(useTourStore.getState().playing).toBe(false);
    expect(useTourStore.getState().currentIndex).toBe(0);
  });
});
