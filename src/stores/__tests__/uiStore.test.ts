import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      activePanel: null,
      showGlobe: true,
      voice: false,
      lanesEnabled: false,
      activeLens: null,
      chatInitMsg: undefined,
    });
  });

  describe('panel management', () => {
    it('starts with no active panel', () => {
      expect(useUIStore.getState().activePanel).toBeNull();
    });

    it('opens a panel', () => {
      useUIStore.getState().openPanel('chat');
      expect(useUIStore.getState().activePanel).toBe('chat');
    });

    it('closes a panel', () => {
      useUIStore.getState().openPanel('chat');
      useUIStore.getState().closePanel();
      expect(useUIStore.getState().activePanel).toBeNull();
    });

    it('switching panels closes the previous one (single active panel)', () => {
      useUIStore.getState().openPanel('chat');
      useUIStore.getState().openPanel('quiz');
      expect(useUIStore.getState().activePanel).toBe('quiz');
    });

    it('opening null closes the panel', () => {
      useUIStore.getState().openPanel('chat');
      useUIStore.getState().openPanel(null);
      expect(useUIStore.getState().activePanel).toBeNull();
    });
  });

  describe('globe', () => {
    it('globe is visible by default', () => {
      expect(useUIStore.getState().showGlobe).toBe(true);
    });

    it('toggleGlobe toggles visibility', () => {
      useUIStore.getState().toggleGlobe();
      expect(useUIStore.getState().showGlobe).toBe(false);
      useUIStore.getState().toggleGlobe();
      expect(useUIStore.getState().showGlobe).toBe(true);
    });
  });

  describe('preferences', () => {
    it('voice defaults to off', () => {
      expect(useUIStore.getState().voice).toBe(false);
    });

    it('toggleVoice works', () => {
      useUIStore.getState().toggleVoice();
      expect(useUIStore.getState().voice).toBe(true);
    });
  });

  describe('lanes', () => {
    it('lanes disabled by default', () => {
      expect(useUIStore.getState().lanesEnabled).toBe(false);
    });

    it('toggleLane adds and removes regions', () => {
      const initial = useUIStore.getState().activeLanes.size;
      useUIStore.getState().toggleLane('europe');
      expect(useUIStore.getState().activeLanes.has('europe')).toBe(false);
      useUIStore.getState().toggleLane('europe');
      expect(useUIStore.getState().activeLanes.has('europe')).toBe(true);
    });
  });

  describe('lens', () => {
    it('no active lens by default', () => {
      expect(useUIStore.getState().activeLens).toBeNull();
    });

    it('setActiveLens sets and clears', () => {
      useUIStore.getState().setActiveLens({ name: 'Science', emoji: '🔬', color: '#00f' });
      expect(useUIStore.getState().activeLens?.name).toBe('Science');
      useUIStore.getState().setActiveLens(null);
      expect(useUIStore.getState().activeLens).toBeNull();
    });
  });

  describe('chat init message', () => {
    it('setChatInitMsg sets and clears', () => {
      useUIStore.getState().setChatInitMsg('Tell me about Rome');
      expect(useUIStore.getState().chatInitMsg).toBe('Tell me about Rome');
      useUIStore.getState().setChatInitMsg(undefined);
      expect(useUIStore.getState().chatInitMsg).toBeUndefined();
    });
  });
});
