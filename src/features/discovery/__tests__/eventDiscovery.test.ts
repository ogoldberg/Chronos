import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * TDD tests for the discovery engine.
 *
 * These tests define the expected behavior AFTER localStorage removal:
 * - Memory-only client cache (no localStorage reads/writes)
 * - Cache stats track in-memory state only
 * - Discovery triggers fetch, caches result in memory
 * - Stale/expired entries are evicted
 */

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock localStorage to verify it's NOT called
const localStorageSpy = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
vi.stubGlobal('localStorage', localStorageSpy);

// Import after mocks
const { discoverEvents, getCacheStats, clearCache } = await import('../eventDiscovery');

describe('eventDiscovery — memory-only cache', () => {
  beforeEach(() => {
    clearCache();
    mockFetch.mockReset();
    localStorageSpy.getItem.mockReset();
    localStorageSpy.setItem.mockReset();
  });

  it('getCacheStats returns zeroes when cache is empty', () => {
    const stats = getCacheStats();
    expect(stats.cells).toBe(0);
    expect(stats.events).toBe(0);
  });

  it('discoverEvents returns empty events for fresh region', () => {
    const result = discoverEvents(1776, 50, new Set(), vi.fn());
    // Should be loading (fetch triggered) with no cached events
    expect(result.events).toEqual([]);
    expect(result.loading).toBe(true);
  });

  it('does not read from localStorage', () => {
    discoverEvents(1776, 50, new Set(), vi.fn());
    expect(localStorageSpy.getItem).not.toHaveBeenCalled();
  });

  it('does not write to localStorage', async () => {
    // Simulate a fetch response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        events: [
          { title: 'Test Event', year: 1776, emoji: '🎯', color: '#fff', description: 'test', category: 'modern' },
        ],
      }),
    });

    const onNew = vi.fn();
    discoverEvents(1776, 50, new Set(), onNew);

    // Wait for async fetch
    await new Promise(r => setTimeout(r, 100));

    expect(localStorageSpy.setItem).not.toHaveBeenCalled();
  });

  it('calls onNewEvents when fetch completes', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        events: [
          { title: 'Test Event', year: 1776, emoji: '🎯', color: '#fff', description: 'test', category: 'modern', wiki: 'Test' },
        ],
      }),
    });

    const onNew = vi.fn();
    discoverEvents(1776, 50, new Set(), onNew);

    // Wait for fetch to complete
    await new Promise(r => setTimeout(r, 300));

    // onNewEvents should have been called with the fetched events
    expect(onNew).toHaveBeenCalled();
    const events = onNew.mock.calls[0][0];
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].title).toBe('Test Event');
  });
});

describe('eventDiscovery — cache stats', () => {
  beforeEach(() => {
    clearCache();
    mockFetch.mockReset();
  });

  it('tracks cached cells and events', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        events: [
          { title: 'E1', year: 1776, emoji: '📌', color: '#888', description: 't', category: 'modern' },
          { title: 'E2', year: 1789, emoji: '📌', color: '#888', description: 't', category: 'modern' },
        ],
      }),
    });

    discoverEvents(1776, 50, new Set(), vi.fn());
    await new Promise(r => setTimeout(r, 200));

    const stats = getCacheStats();
    expect(stats.cells).toBeGreaterThan(0);
    expect(stats.events).toBeGreaterThan(0);
  });
});
