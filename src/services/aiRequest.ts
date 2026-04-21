/**
 * Shared "needs API key" plumbing.
 *
 * The app used to route AI calls through our server via aiFetch(). That's
 * gone — every AI call now runs directly in the browser (src/ai/callAI.ts).
 * The only bits we kept are the DOM event + error type that let deep
 * services notify the root App that the user needs to open Settings.
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
