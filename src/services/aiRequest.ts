/**
 * aiRequest — fetch wrapper that injects the user's AI credentials.
 *
 * Every AI-hitting call in the app must go through this helper so the
 * `X-User-*` headers match what the server's getProviderForRequest
 * expects. The alternative (each call site building its own headers)
 * leads to missed migrations and half-configured requests.
 *
 * Returns a typed result that distinguishes "missing key" from other
 * errors so callers can trigger the Settings gate without repeating
 * the 401-body-sniffing logic everywhere.
 */

import { getAIConfig } from '../stores/aiConfigStore';

/**
 * Shared event that bubbles a "missing API key" up to the root app
 * where an AI-settings overlay can listen and pop itself open. Using a
 * DOM event instead of a callback because the failure can originate
 * from deeply nested services (factCheck, primarySources, etc.) that
 * have no direct path to the UI store.
 */
export const AI_KEY_NEEDED_EVENT = 'chronos:ai-key-needed';

export function requestAIKey(reason?: string) {
  window.dispatchEvent(new CustomEvent(AI_KEY_NEEDED_EVENT, { detail: { reason } }));
}

export class AIKeyMissingError extends Error {
  readonly kind = 'missing_api_key';
  readonly provider: string;
  constructor(provider: string) {
    super(`No API key for ${provider}. Open Settings to add one.`);
    this.provider = provider;
  }
}

/**
 * Fire a fetch against an AI-hitting endpoint with the user's config
 * attached. Drop-in-compatible with `fetch(url, init)` — the caller
 * supplies headers/body/method just like they would to fetch, and we
 * merge in the `X-User-*` credentials.
 *
 * Throws `AIKeyMissingError` if the user hasn't configured a key yet —
 * the caller should listen for this (or catch it and show its own
 * gate). Also dispatches `AI_KEY_NEEDED_EVENT` so a top-level listener
 * can open the Settings panel.
 *
 * For non-AI endpoints, keep using plain fetch — attaching the user's
 * key to every request would be wasteful and leak it to endpoints
 * that don't need it.
 */
export async function aiFetch(input: string, options: RequestInit = {}): Promise<Response> {
  const cfg = getAIConfig();
  if (!cfg.isConfigured) {
    requestAIKey('No API key configured');
    throw new AIKeyMissingError(cfg.provider);
  }

  // Merge caller's headers over ours — but never let the caller
  // accidentally override the auth headers (they'd have to explicitly
  // pass an X-User-API-Key themselves, which no legitimate call does).
  const existing = new Headers(options.headers);
  existing.set('X-User-Provider', cfg.provider);
  existing.set('X-User-Model', cfg.model);
  if (cfg.apiKey) existing.set('X-User-API-Key', cfg.apiKey);
  if (cfg.baseUrl) existing.set('X-User-Base-Url', cfg.baseUrl);
  // Default to JSON content type when there's a body and no type set.
  if (options.body && !existing.has('Content-Type')) {
    existing.set('Content-Type', 'application/json');
  }

  const resp = await fetch(input, { ...options, headers: existing });

  // 401 with missing_api_key body means the server rejected the request
  // even though we sent a key. Still surface the settings gate — maybe
  // the key expired or was revoked.
  if (resp.status === 401) {
    try {
      const clone = resp.clone();
      const data = await clone.json();
      if (data?.error === 'missing_api_key') {
        requestAIKey(data.message || 'API key rejected');
        throw new AIKeyMissingError(data.provider || cfg.provider);
      }
    } catch (err) {
      if (err instanceof AIKeyMissingError) throw err;
      // Non-JSON 401; fall through and return the response.
    }
  }

  return resp;
}

/**
 * Convenience wrapper: JSON-fetch that already parses the response and
 * throws on non-2xx (other than 401-missing-key, which aiFetch converts
 * to AIKeyMissingError). Use this for the typical AI JSON endpoint.
 */
export async function aiFetchJSON<T = unknown>(input: string, options: RequestInit = {}): Promise<T> {
  const resp = await aiFetch(input, options);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`AI request failed (${resp.status}): ${text.slice(0, 500)}`);
  }
  return resp.json() as Promise<T>;
}
