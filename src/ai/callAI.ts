/**
 * Unified AI entry point — every feature calls one of these helpers.
 *
 * Reads the user's configured provider/model/key from `aiConfigStore`
 * and dispatches to the right browser-side provider adapter. The user's
 * key goes directly from localStorage to the AI provider's HTTPS
 * endpoint. Our server is never in the path.
 *
 * Each provider SDK is imported dynamically so we only pay the bundle
 * cost for whichever one the user selected. First call incurs one
 * extra round-trip to load the SDK chunk; subsequent calls are
 * in-memory.
 */

import { getAIConfig } from '../stores/aiConfigStore';
import type { AIMessage, AIProvider, AIResponse, AIChatOptions } from './types';
import { requestAIKey, AIKeyMissingError } from '../services/aiRequest';

let cachedProvider: { key: string; provider: AIProvider } | null = null;

/**
 * Build (or reuse) an AIProvider that matches the user's current config.
 * Caches on a composite key of provider+model+apiKey+baseUrl so we only
 * rebuild when the config actually changes.
 */
async function getProvider(): Promise<AIProvider> {
  const cfg = getAIConfig();
  if (!cfg.isConfigured) {
    requestAIKey('No API key configured');
    throw new AIKeyMissingError(cfg.provider);
  }
  const cacheKey = `${cfg.provider}:${cfg.model}:${cfg.apiKey}:${cfg.baseUrl}`;
  if (cachedProvider && cachedProvider.key === cacheKey) return cachedProvider.provider;

  let provider: AIProvider;
  switch (cfg.provider) {
    case 'openai': {
      const { OpenAIClientProvider } = await import('./providers/openai');
      provider = new OpenAIClientProvider({
        apiKey: cfg.apiKey,
        model: cfg.model,
        baseUrl: cfg.baseUrl || undefined,
      });
      break;
    }
    case 'google': {
      const { GoogleClientProvider } = await import('./providers/google');
      provider = new GoogleClientProvider({ apiKey: cfg.apiKey, model: cfg.model });
      break;
    }
    case 'ollama': {
      const { OllamaClientProvider } = await import('./providers/ollama');
      provider = new OllamaClientProvider({ model: cfg.model, baseUrl: cfg.baseUrl || undefined });
      break;
    }
    case 'anthropic':
    default: {
      const { AnthropicClientProvider } = await import('./providers/anthropic');
      provider = new AnthropicClientProvider({
        apiKey: cfg.apiKey,
        model: cfg.model,
        baseUrl: cfg.baseUrl || undefined,
      });
      break;
    }
  }
  cachedProvider = { key: cacheKey, provider };
  return provider;
}

export async function callAI(
  system: string,
  messages: AIMessage[],
  options?: AIChatOptions,
): Promise<AIResponse> {
  const provider = await getProvider();
  return provider.chat(system, messages, options);
}

export async function streamAI(
  system: string,
  messages: AIMessage[],
  onToken: (token: string) => void,
  options?: AIChatOptions,
): Promise<AIResponse> {
  const provider = await getProvider();
  return provider.chatStream(system, messages, onToken, options);
}

/**
 * Convenience: run a chat and parse the result as JSON. Many of our
 * prompts ask the model for a JSON array/object response — this helper
 * strips the common fence markdown the model adds and gives a typed
 * value back. Throws if the response can't be parsed.
 */
export async function callAIJSON<T = unknown>(
  system: string,
  messages: AIMessage[],
  options?: AIChatOptions,
): Promise<{ data: T; sources: AIResponse['sources'] }> {
  const { text, sources } = await callAI(system, messages, options);
  const cleaned = stripJSONFence(text);
  return { data: JSON.parse(cleaned) as T, sources };
}

/**
 * Strip ```json ... ``` fences some models wrap around structured output.
 * Also strips leading/trailing whitespace that would break JSON.parse.
 */
export function stripJSONFence(s: string): string {
  let out = s.trim();
  // Remove leading fence (```json or just ```)
  out = out.replace(/^```(?:json)?\s*/i, '');
  // Remove trailing fence
  out = out.replace(/\s*```\s*$/g, '');
  return out.trim();
}

export { AIKeyMissingError } from '../services/aiRequest';
export type { AIMessage, AIResponse, AIChatOptions } from './types';
