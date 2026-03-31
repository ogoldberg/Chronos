/**
 * AI Provider Factory
 *
 * Reads AI_PROVIDER and AI_MODEL from env to determine which backend to use.
 * Defaults to Anthropic Claude if nothing is set.
 *
 * Environment variables:
 *   AI_PROVIDER=anthropic|openai|google|ollama
 *   AI_MODEL=claude-sonnet-4-20250514 (or gpt-4o, gemini-2.0-flash, llama3.1, etc.)
 *   AI_BASE_URL=https://... (optional, for proxies/Azure/Ollama)
 *   AI_MAX_TOKENS=2000
 *   AI_WEB_SEARCH=true|false
 *
 * Provider-specific keys:
 *   ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_AI_API_KEY
 */

import type { AIProvider, AIProviderConfig } from './types';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';
import { GoogleProvider } from './google';
import { OllamaProvider } from './ollama';

export type { AIProvider, AIMessage, AIResponse, AIProviderConfig } from './types';

let _provider: AIProvider | null = null;

export function getProviderConfig(): AIProviderConfig {
  return {
    provider: process.env.AI_PROVIDER || 'anthropic',
    model: process.env.AI_MODEL || getDefaultModel(process.env.AI_PROVIDER || 'anthropic'),
    baseUrl: process.env.AI_BASE_URL,
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '2000', 10),
    webSearch: process.env.AI_WEB_SEARCH !== 'false',
  };
}

function getDefaultModel(provider: string): string {
  switch (provider) {
    case 'openai': return 'gpt-4o';
    case 'google': return 'gemini-2.0-flash';
    case 'ollama': return 'llama3.1';
    default: return 'claude-sonnet-4-20250514';
  }
}

export function createProvider(config?: AIProviderConfig): AIProvider {
  const cfg = config || getProviderConfig();

  switch (cfg.provider) {
    case 'openai':
      return new OpenAIProvider(cfg);
    case 'google':
      return new GoogleProvider(cfg);
    case 'ollama':
      return new OllamaProvider(cfg);
    case 'anthropic':
    default:
      return new AnthropicProvider(cfg);
  }
}

/**
 * Get the singleton provider instance.
 * Call this from route handlers.
 */
export function getProvider(): AIProvider {
  if (!_provider) {
    const config = getProviderConfig();
    _provider = createProvider(config);
    console.log(`[AI] Provider: ${_provider.name} | Model: ${config.model} | Web search: ${config.webSearch}`);
  }
  return _provider;
}

/**
 * Switch provider at runtime (e.g. from an admin API).
 */
export function setProvider(config: AIProviderConfig): AIProvider {
  _provider = createProvider(config);
  console.log(`[AI] Switched to: ${_provider.name} | Model: ${config.model}`);
  return _provider;
}
