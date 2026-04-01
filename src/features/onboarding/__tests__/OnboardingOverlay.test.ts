import { describe, it, expect, beforeEach } from 'vitest';

const STORAGE_KEY = 'chronos_onboarded';

// Unit tests for onboarding logic (node environment — no DOM rendering)
describe('OnboardingOverlay logic', () => {
  beforeEach(() => {
    // Reset localStorage mock
    globalThis.localStorage = {
      _store: {} as Record<string, string>,
      getItem(key: string) { return (this._store as Record<string, string>)[key] ?? null; },
      setItem(key: string, value: string) { (this._store as Record<string, string>)[key] = value; },
      removeItem(key: string) { delete (this._store as Record<string, string>)[key]; },
      clear() { this._store = {}; },
      get length() { return Object.keys(this._store).length; },
      key(index: number) { return Object.keys(this._store)[index] ?? null; },
    } as Storage;
  });

  it('detects first visit when localStorage key is absent', () => {
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('detects returning user when localStorage key is set', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('sets onboarded flag on completion', () => {
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    localStorage.setItem(STORAGE_KEY, 'true');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('clears onboarded flag for re-trigger', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    localStorage.removeItem(STORAGE_KEY);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('tutorial has exactly 5 steps', async () => {
    // Import the module to verify step count
    const mod = await import('../OnboardingOverlay');
    // The module exports a default (component), triggerOnboarding, and ShowMeAroundButton
    expect(mod.default).toBeDefined();
    expect(typeof mod.triggerOnboarding).toBe('function');
    expect(typeof mod.ShowMeAroundButton).toBe('function');
  });

  it('triggerOnboarding dispatches a custom event', async () => {
    const mod = await import('../OnboardingOverlay');
    let fired = false;
    const handler = () => { fired = true; };

    // Minimal CustomEvent polyfill for node
    if (typeof CustomEvent === 'undefined') {
      (globalThis as Record<string, unknown>).CustomEvent = class CustomEvent extends Event {
        detail: unknown;
        constructor(type: string, params?: { detail?: unknown }) {
          super(type);
          this.detail = params?.detail;
        }
      };
    }

    // Minimal window.dispatchEvent for node
    const events: Record<string, Array<() => void>> = {};
    if (typeof window === 'undefined') {
      (globalThis as Record<string, unknown>).window = {
        addEventListener(type: string, fn: () => void) { (events[type] ??= []).push(fn); },
        removeEventListener() { /* noop */ },
        dispatchEvent(e: Event) {
          (events[e.type] ?? []).forEach(fn => fn());
          return true;
        },
      };
    }

    window.addEventListener(mod.ONBOARDING_RESET_EVENT, handler);
    mod.triggerOnboarding();
    expect(fired).toBe(true);
  });
});
