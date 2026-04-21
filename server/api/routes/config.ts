/**
 * GET /api/config — return supported AI providers and their default models.
 *
 * Previously this route exposed whatever provider/model/key were set in
 * env and let an admin key switch providers at runtime. Both are gone now:
 * the server has no server-wide provider state any more. Users bring their
 * own keys; this endpoint just advertises what the Settings UI should
 * offer in its dropdowns.
 */

import type { RouteHandler } from '../index';

interface ProviderOption {
  id: 'anthropic' | 'openai' | 'google' | 'ollama';
  label: string;
  /** Short hint shown under the provider in the Settings UI. */
  description: string;
  /** Default model picked when the user switches to this provider. */
  defaultModel: string;
  /** Suggested models — shown as options in a datalist so users can still
   *  type any model id they want (important since new models ship often). */
  suggestedModels: string[];
  /** Where the user gets an API key. Shown as a hyperlink in Settings. */
  keyPage?: string;
  /** If true, the provider is local-only and doesn't need an API key. */
  localOnly?: boolean;
}

const PROVIDERS: ProviderOption[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    description: 'Best quality for history + web search. Recommended.',
    defaultModel: 'claude-sonnet-4-20250514',
    suggestedModels: [
      'claude-opus-4-20250514',
      'claude-sonnet-4-20250514',
      'claude-3-5-haiku-20241022',
    ],
    keyPage: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    description: 'Wide model selection. Cheaper than Claude for simple tasks.',
    defaultModel: 'gpt-4o',
    suggestedModels: ['gpt-4o', 'gpt-4o-mini', 'o1-mini', 'gpt-4-turbo'],
    keyPage: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'google',
    label: 'Google (Gemini)',
    description: 'Free tier available. Good for long-context queries.',
    defaultModel: 'gemini-2.0-flash',
    suggestedModels: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    keyPage: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    description: 'Runs locally on your machine. No API key, no cost.',
    defaultModel: 'llama3.1',
    suggestedModels: ['llama3.1', 'mistral', 'qwen2.5'],
    localOnly: true,
  },
];

export function registerConfigRoutes(handleRoute: RouteHandler) {
  handleRoute('GET', '/api/config', null, async () => {
    return { status: 200, data: { providers: PROVIDERS } };
  });
}
