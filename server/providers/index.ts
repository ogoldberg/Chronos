/**
 * AI Provider Factory
 *
 * Every AI-using route must read the user's provider/model/key from the
 * inbound request headers and build a per-request provider instance. We
 * deliberately do NOT cache a server-wide singleton with an env-based key
 * any more — if the app accidentally shipped with a key in env, a public
 * deploy would hand out free AI credits to anyone who hits the endpoints.
 *
 * Headers (case-insensitive, forwarded by the client helper `aiRequest`):
 *   X-User-Provider  — "anthropic" | "openai" | "google" | "ollama"
 *   X-User-Model     — provider-specific model id
 *   X-User-API-Key   — the user's own key (required for all paid providers)
 *   X-User-Base-Url  — optional override (for proxies, self-hosted, etc.)
 *
 * Ollama is an exception — it's a local-only backend with no API key; we
 * still let it go through so power users can run fully local.
 */

import type { AIProvider, AIProviderConfig } from './types';
import { MissingAPIKeyError } from './types';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';
import { GoogleProvider } from './google';
import { OllamaProvider } from './ollama';

export type { AIProvider, AIMessage, AIResponse, AIProviderConfig } from './types';
export { MissingAPIKeyError } from './types';

function getDefaultModel(provider: string): string {
  switch (provider) {
    case 'openai': return 'gpt-4o';
    case 'google': return 'gemini-2.0-flash';
    case 'ollama': return 'llama3.1';
    default: return 'claude-sonnet-4-20250514';
  }
}

const SUPPORTED_PROVIDERS = new Set(['anthropic', 'openai', 'google', 'ollama']);

function firstHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const v = headers[name.toLowerCase()] ?? headers[name];
  if (Array.isArray(v)) return v[0];
  return v;
}

export function createProvider(config: AIProviderConfig): AIProvider {
  switch (config.provider) {
    case 'openai': return new OpenAIProvider(config);
    case 'google': return new GoogleProvider(config);
    case 'ollama': return new OllamaProvider(config);
    case 'anthropic':
    default:
      return new AnthropicProvider(config);
  }
}

/**
 * Build a provider using the user's headers from the current request.
 * Throws `MissingAPIKeyError` when a key is required but missing so the
 * caller can return a 401 with a structured body.
 */
export function getProviderForRequest(
  headers: Record<string, string | string[] | undefined> | undefined,
): AIProvider {
  const h = headers ?? {};
  const provider = (firstHeader(h, 'x-user-provider') || 'anthropic').toLowerCase();
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }

  const model = firstHeader(h, 'x-user-model') || getDefaultModel(provider);
  const apiKey = firstHeader(h, 'x-user-api-key') || undefined;
  const baseUrl = firstHeader(h, 'x-user-base-url') || undefined;

  return createProvider({
    provider,
    model,
    apiKey,
    baseUrl,
    maxTokens: 2000,
    // Web search defaults to enabled for Anthropic; other providers opt in
    // themselves when they support it.
    webSearch: provider === 'anthropic',
  });
}
