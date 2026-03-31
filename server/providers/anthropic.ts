import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AIMessage, AIResponse, AIProviderConfig } from './types';

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private webSearch: boolean;

  constructor(config: AIProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.maxTokens = config.maxTokens || 2000;
    this.webSearch = config.webSearch ?? true;
  }

  async chat(
    system: string,
    messages: AIMessage[],
    options?: { maxTokens?: number; webSearch?: boolean },
  ): Promise<AIResponse> {
    const useWebSearch = options?.webSearch ?? this.webSearch;

    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens || this.maxTokens,
      system,
      ...(useWebSearch
        ? { tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }] }
        : {}),
      messages: messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    });

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    return { text };
  }
}
