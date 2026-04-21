/**
 * AI Configuration Store — persisted per-user, per-browser.
 *
 * The user brings their own API key. We store it in localStorage (via
 * zustand/middleware/persist) and attach it to every AI-hitting request
 * as `X-User-*` headers. There is no server-side fallback — if the key
 * is missing, AI features show a gentle gate pointing to the Settings
 * panel.
 *
 * We store the key in plaintext in localStorage by design:
 *   - This is a single-user-per-browser app; there's no server-side
 *     identity to key against.
 *   - The key is theirs, paying their usage. If an attacker can read
 *     localStorage, they already own the browser.
 *   - Encrypting with a password would add friction without meaningful
 *     security (the decryption key would have to live somewhere the
 *     attacker could also see).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AIProviderId = 'anthropic' | 'openai' | 'google' | 'ollama';

/**
 * Matches the server's /api/config provider list. Fetched on demand by
 * the Settings panel so we don't hardcode model lists in two places.
 */
export interface ProviderOption {
  id: AIProviderId;
  label: string;
  description: string;
  defaultModel: string;
  suggestedModels: string[];
  keyPage?: string;
  localOnly?: boolean;
}

interface AIConfigState {
  provider: AIProviderId;
  model: string;
  apiKey: string;
  baseUrl: string;

  setProvider: (p: AIProviderId, defaultModel: string) => void;
  setModel: (m: string) => void;
  setApiKey: (k: string) => void;
  setBaseUrl: (u: string) => void;
  clear: () => void;

  /**
   * True when the user has supplied enough config to make an AI call.
   * Ollama is the exception — it's local-only and doesn't need a key,
   * so a configured provider+model is sufficient.
   */
  isConfigured: () => boolean;
}

export const useAIConfigStore = create<AIConfigState>()(
  persist(
    (set, get) => ({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      apiKey: '',
      baseUrl: '',

      setProvider: (provider, defaultModel) => set({ provider, model: defaultModel }),
      setModel: (model) => set({ model }),
      setApiKey: (apiKey) => set({ apiKey: apiKey.trim() }),
      setBaseUrl: (baseUrl) => set({ baseUrl: baseUrl.trim() }),
      clear: () => set({ apiKey: '', baseUrl: '' }),

      isConfigured: () => {
        const { provider, apiKey } = get();
        if (provider === 'ollama') return true;
        return apiKey.length > 0;
      },
    }),
    {
      name: 'chronos-ai-config',
      // Only persist the config values, not the function references.
      partialize: (s) => ({
        provider: s.provider,
        model: s.model,
        apiKey: s.apiKey,
        baseUrl: s.baseUrl,
      }),
    },
  ),
);

/**
 * Convenience snapshot for non-React callers (like the aiRequest helper).
 * Reads the current store state without subscribing.
 */
export function getAIConfig() {
  const s = useAIConfigStore.getState();
  return {
    provider: s.provider,
    model: s.model,
    apiKey: s.apiKey,
    baseUrl: s.baseUrl,
    isConfigured: s.isConfigured(),
  };
}
