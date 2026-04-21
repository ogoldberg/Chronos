/**
 * Anthropic provider — runs entirely in the browser using the official
 * SDK with `dangerouslyAllowBrowser: true`. The name is scarier than
 * the reality: Anthropic added first-class browser support for BYOK
 * apps like this one. The user's key is theirs, and it never leaves
 * this browser except on the direct HTTPS connection to Anthropic.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AIMessage, AIResponse, AIChatOptions, AISource } from '../types';

interface Config {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export class AnthropicClientProvider implements AIProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  private model: string;

  constructor(config: Config) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      dangerouslyAllowBrowser: true,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    this.model = config.model;
  }

  async chat(system: string, messages: AIMessage[], options?: AIChatOptions): Promise<AIResponse> {
    const tools = options?.webSearch
      ? [{ type: 'web_search_20250305' as const, name: 'web_search' as const, max_uses: 5 }]
      : undefined;

    const msg = await this.client.messages.create({
      model: options?.model || this.model,
      max_tokens: options?.maxTokens || 2000,
      system,
      messages: messages.map((m) => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.content,
      })),
      ...(tools ? { tools } : {}),
    }, options?.signal ? { signal: options.signal } : undefined);

    const { text, sources } = extractTextAndSources(msg);
    return { text, sources };
  }

  async chatStream(
    system: string,
    messages: AIMessage[],
    onToken: (token: string) => void,
    options?: AIChatOptions,
  ): Promise<AIResponse> {
    const tools = options?.webSearch
      ? [{ type: 'web_search_20250305' as const, name: 'web_search' as const, max_uses: 5 }]
      : undefined;

    const stream = this.client.messages.stream({
      model: options?.model || this.model,
      max_tokens: options?.maxTokens || 2000,
      system,
      messages: messages.map((m) => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.content,
      })),
      ...(tools ? { tools } : {}),
    }, options?.signal ? { signal: options.signal } : undefined);

    let text = '';
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        text += chunk.delta.text;
        onToken(chunk.delta.text);
      }
    }
    const final = await stream.finalMessage();
    const { sources } = extractTextAndSources(final);
    return { text, sources };
  }
}

function extractTextAndSources(msg: Anthropic.Messages.Message): { text: string; sources: AISource[] } {
  const parts: string[] = [];
  const sources: AISource[] = [];
  const seen = new Set<string>();
  for (const block of msg.content) {
    if (block.type === 'text') {
      parts.push(block.text);
      // Web-search results emit inline citations via <cite> tags; Anthropic
      // also attaches citation data on the block. We harvest both paths.
      const cits = (block as { citations?: Array<{ url?: string; title?: string }> }).citations;
      if (Array.isArray(cits)) {
        for (const c of cits) {
          if (c?.url && !seen.has(c.url)) {
            seen.add(c.url);
            sources.push({ url: c.url, title: c.title ?? c.url });
          }
        }
      }
    }
  }
  return { text: parts.join(''), sources };
}
