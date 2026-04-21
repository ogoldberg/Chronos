/**
 * OpenAI provider — browser-direct with `dangerouslyAllowBrowser: true`.
 * Same BYOK rationale as Anthropic: the user's key stays in their
 * browser and goes directly to OpenAI.
 */

import OpenAI from 'openai';
import type { AIProvider, AIMessage, AIResponse, AIChatOptions } from '../types';

interface Config {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export class OpenAIClientProvider implements AIProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private model: string;

  constructor(config: Config) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      dangerouslyAllowBrowser: true,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    this.model = config.model;
  }

  async chat(system: string, messages: AIMessage[], options?: AIChatOptions): Promise<AIResponse> {
    const resp = await this.client.chat.completions.create(
      {
        model: options?.model || this.model,
        max_tokens: options?.maxTokens || 2000,
        messages: [
          { role: 'system', content: system },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      },
      options?.signal ? { signal: options.signal } : undefined,
    );
    return { text: resp.choices[0]?.message?.content || '' };
  }

  async chatStream(
    system: string,
    messages: AIMessage[],
    onToken: (token: string) => void,
    options?: AIChatOptions,
  ): Promise<AIResponse> {
    const stream = await this.client.chat.completions.create(
      {
        model: options?.model || this.model,
        max_tokens: options?.maxTokens || 2000,
        stream: true,
        messages: [
          { role: 'system', content: system },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      },
      options?.signal ? { signal: options.signal } : undefined,
    );
    let text = '';
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || '';
      if (token) {
        text += token;
        onToken(token);
      }
    }
    return { text };
  }
}
