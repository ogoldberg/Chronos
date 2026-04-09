import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { unbrowserEnabled, verifyClaims } from '../unbrowser';

/**
 * Tests for the thin Unbrowser client wrapper.
 *
 * This module used to carry a 30-line client-side `titleMatches`
 * function (tested here with ~10 cases). After Unbrowser shipped
 * `/v1/verify` which does the matching server-side with better
 * Unicode and acronym handling, we deleted that function. The
 * wrapper is now a thin adapter: take claims, call /v1/verify,
 * shape the response. These tests exercise the adapter, not the
 * matching logic (which lives in Unbrowser and has its own 37
 * tests there).
 *
 * We use a fetch mock so nothing hits the network.
 */

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_KEY = process.env.UNBROWSER_API_KEY;

function mockFetch(response: {
  ok?: boolean;
  json?: () => Promise<unknown>;
  throws?: Error;
}): void {
  global.fetch = vi.fn().mockImplementation(async () => {
    if (response.throws) throw response.throws;
    return {
      ok: response.ok ?? true,
      json: response.json ?? (async () => ({ success: true, data: { results: [] } })),
    };
  }) as unknown as typeof global.fetch;
}

beforeEach(() => {
  process.env.UNBROWSER_API_KEY = 'ub_test_fake';
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_KEY) process.env.UNBROWSER_API_KEY = ORIGINAL_KEY;
  else delete process.env.UNBROWSER_API_KEY;
  vi.restoreAllMocks();
});

describe('unbrowserEnabled', () => {
  it('returns true when UNBROWSER_API_KEY is set', () => {
    process.env.UNBROWSER_API_KEY = 'ub_test_fake';
    expect(unbrowserEnabled()).toBe(true);
  });

  it('returns false when UNBROWSER_API_KEY is missing', () => {
    delete process.env.UNBROWSER_API_KEY;
    expect(unbrowserEnabled()).toBe(false);
  });

  it('returns false when UNBROWSER_API_KEY is empty string', () => {
    process.env.UNBROWSER_API_KEY = '';
    expect(unbrowserEnabled()).toBe(false);
  });
});

describe('verifyClaims', () => {
  describe('short-circuits', () => {
    it('returns [] immediately when unbrowser is disabled', async () => {
      delete process.env.UNBROWSER_API_KEY;
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as unknown as typeof global.fetch;
      const result = await verifyClaims([{ url: 'https://example.com/' }]);
      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns [] immediately for an empty claims array', async () => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as unknown as typeof global.fetch;
      const result = await verifyClaims([]);
      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('successful responses', () => {
    it('zips the response results by input order', async () => {
      mockFetch({
        json: async () => ({
          success: true,
          data: {
            results: [
              {
                url: 'https://a.com/',
                verified: true,
                confidence: 1,
                extractedTitle: 'Page A',
                checks: { reachable: { passed: true } },
              },
              {
                url: 'https://b.com/',
                verified: false,
                confidence: 0,
                extractedTitle: 'Page B',
                checks: { reachable: { passed: true } },
              },
            ],
          },
        }),
      });
      const result = await verifyClaims([
        { url: 'https://a.com/', title: 'A' },
        { url: 'https://b.com/', title: 'B' },
      ]);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        url: 'https://a.com/',
        verified: true,
        extractedTitle: 'Page A',
        reachable: true,
      });
      expect(result[1]).toEqual({
        url: 'https://b.com/',
        verified: false,
        extractedTitle: 'Page B',
        reachable: true,
      });
    });

    it('marks sources as not reachable when the per-source result has an error', async () => {
      mockFetch({
        json: async () => ({
          success: true,
          data: {
            results: [
              {
                url: 'https://broken.com/',
                verified: false,
                confidence: 0,
                error: 'Network timeout',
                checks: {
                  reachable: { passed: false, reason: 'Network timeout' },
                },
              },
            ],
          },
        }),
      });
      const result = await verifyClaims([{ url: 'https://broken.com/' }]);
      expect(result).toHaveLength(1);
      expect(result[0].verified).toBe(false);
      expect(result[0].reachable).toBe(false);
      expect(result[0].extractedTitle).toBeNull();
    });

    it('handles missing extractedTitle by returning null', async () => {
      mockFetch({
        json: async () => ({
          success: true,
          data: {
            results: [
              {
                url: 'https://a.com/',
                verified: true,
                confidence: 1,
                // no extractedTitle
                checks: { reachable: { passed: true } },
              },
            ],
          },
        }),
      });
      const result = await verifyClaims([{ url: 'https://a.com/' }]);
      expect(result[0].extractedTitle).toBeNull();
      expect(result[0].reachable).toBe(true);
    });
  });

  describe('transport failure handling', () => {
    it('returns [] when fetch rejects (network error)', async () => {
      mockFetch({ throws: new Error('ECONNREFUSED') });
      const result = await verifyClaims([{ url: 'https://example.com/' }]);
      expect(result).toEqual([]);
    });

    it('returns [] when the response is not ok', async () => {
      mockFetch({ ok: false });
      const result = await verifyClaims([{ url: 'https://example.com/' }]);
      expect(result).toEqual([]);
    });

    it('returns [] when the response results length does not match claims length', async () => {
      // Length mismatch means the server layer misbehaved — the
      // /v1/verify endpoint guarantees one result per source in
      // request order. Return [] so the caller's length-guard
      // falls back to unverified candidates rather than silently
      // treating every claim as unreachable. This preserves the
      // "transient Unbrowser issue shouldn't drop everything"
      // contract documented in the sources route.
      mockFetch({
        json: async () => ({
          success: true,
          data: { results: [] }, // empty despite claim input
        }),
      });
      const result = await verifyClaims([
        { url: 'https://a.com/' },
        { url: 'https://b.com/' },
      ]);
      expect(result).toEqual([]);
    });
  });

  describe('request shape', () => {
    it('sends the claims to /v1/verify with auth header and default options', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { results: [] } }),
      });
      global.fetch = fetchSpy as unknown as typeof global.fetch;

      await verifyClaims([
        { url: 'https://a.com/', title: 'Origin of Species', year: 1859, author: 'Darwin' },
      ]);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/v1/verify');
      expect((init.headers as Record<string, string>)['Authorization']).toMatch(/Bearer ub_test_fake/);
      const body = JSON.parse(init.body as string);
      expect(body.sources).toHaveLength(1);
      expect(body.sources[0]).toEqual({
        url: 'https://a.com/',
        title: 'Origin of Species',
        year: 1859,
        author: 'Darwin',
      });
      // Defaults propagated to the server. titleThreshold is 0.25
      // (lower than Unbrowser's 0.5 default) because AI-generated
      // primary-source claims often include long Victorian
      // subtitles ("...by Means of Natural Selection, or the
      // Preservation of Favoured Races...") that don't match
      // short archive page titles. 0.25 is the empirical floor
      // for the Darwin/Wikisource case (3 hits / 12 claim tokens).
      expect(body.options.titleThreshold).toBe(0.25);
      expect(body.options.rejectSoft404).toBe(true);
      expect(body.options.rejectSoftAuth).toBe(false);
    });

    it('honors UNBROWSER_BASE_URL override', async () => {
      process.env.UNBROWSER_BASE_URL = 'https://unbrowser.internal';
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { results: [] } }),
      });
      global.fetch = fetchSpy as unknown as typeof global.fetch;

      await verifyClaims([{ url: 'https://a.com/' }]);

      const [url] = fetchSpy.mock.calls[0] as [string];
      expect(url).toBe('https://unbrowser.internal/v1/verify');
      delete process.env.UNBROWSER_BASE_URL;
    });
  });
});
