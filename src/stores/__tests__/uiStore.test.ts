import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../uiStore';
import { makeCustomTheme } from '../../data/themes';

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

  describe('themed timelines', () => {
    it('themed timelines disabled by default', () => {
      expect(useUIStore.getState().themedTimelinesEnabled).toBe(false);
    });

    it('starts with every theme active', () => {
      const themes = useUIStore.getState().activeThemes;
      expect(themes.size).toBeGreaterThanOrEqual(6);
      expect(themes.has('science')).toBe(true);
      expect(themes.has('art')).toBe(true);
    });

    it('toggleThemedTimelines flips the flag', () => {
      useUIStore.getState().toggleThemedTimelines();
      expect(useUIStore.getState().themedTimelinesEnabled).toBe(true);
      useUIStore.getState().toggleThemedTimelines();
      expect(useUIStore.getState().themedTimelinesEnabled).toBe(false);
    });

    it('toggleActiveTheme adds and removes individual themes', () => {
      useUIStore.getState().toggleActiveTheme('war');
      expect(useUIStore.getState().activeThemes.has('war')).toBe(false);
      useUIStore.getState().toggleActiveTheme('war');
      expect(useUIStore.getState().activeThemes.has('war')).toBe(true);
    });

    it('enabling themed timelines turns off region lanes', () => {
      useUIStore.setState({ lanesEnabled: true, themedTimelinesEnabled: false });
      useUIStore.getState().toggleThemedTimelines();
      expect(useUIStore.getState().themedTimelinesEnabled).toBe(true);
      expect(useUIStore.getState().lanesEnabled).toBe(false);
    });

    it('enabling region lanes turns off themed timelines', () => {
      useUIStore.setState({ lanesEnabled: false, themedTimelinesEnabled: true });
      useUIStore.getState().toggleLanes();
      expect(useUIStore.getState().lanesEnabled).toBe(true);
      expect(useUIStore.getState().themedTimelinesEnabled).toBe(false);
    });
  });

  describe('custom themes', () => {
    beforeEach(() => {
      // Clear any persisted state between tests so localStorage doesn't
      // leak custom themes across cases.
      if (typeof localStorage !== 'undefined') localStorage.clear();
      useUIStore.setState({ customThemes: [] });
    });

    it('addCustomTheme appends to the list and auto-enables the theme', () => {
      const theme = makeCustomTheme({ label: 'Color blue', tags: ['blue'] });
      useUIStore.getState().addCustomTheme(theme);
      const state = useUIStore.getState();
      expect(state.customThemes.some(t => t.id === theme.id)).toBe(true);
      expect(state.activeThemes.has(theme.id)).toBe(true);
    });

    it('addCustomTheme replaces existing theme with same id (edit flow)', () => {
      const a = makeCustomTheme({ label: 'Color blue', tags: ['blue'] });
      useUIStore.getState().addCustomTheme(a);
      const b = { ...a, label: 'The color blue' };
      useUIStore.getState().addCustomTheme(b);
      const state = useUIStore.getState();
      expect(state.customThemes.filter(t => t.id === a.id)).toHaveLength(1);
      expect(state.customThemes[0].label).toBe('The color blue');
    });

    it('removeCustomTheme drops it and disables the theme', () => {
      const theme = makeCustomTheme({ label: 'Gone soon' });
      useUIStore.getState().addCustomTheme(theme);
      useUIStore.getState().removeCustomTheme(theme.id);
      const state = useUIStore.getState();
      expect(state.customThemes.some(t => t.id === theme.id)).toBe(false);
      expect(state.activeThemes.has(theme.id)).toBe(false);
    });

    it('persists custom themes to localStorage', () => {
      if (typeof localStorage === 'undefined') return;
      const theme = makeCustomTheme({ label: 'Persist me', tags: ['foo'] });
      useUIStore.getState().addCustomTheme(theme);
      const raw = localStorage.getItem('chronos_custom_themes_v1');
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.some((t: { id: string }) => t.id === theme.id)).toBe(true);
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
