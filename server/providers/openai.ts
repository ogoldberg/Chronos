import OpenAI from 'openai';
import type { AIProvider, AIMessage, AIResponse, AIProviderConfig, AIChatOptions } from './types';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private webSearch: boolean;

  constructor(config: AIProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    this.model = config.model || 'gpt-4o';
    this.maxTokens = config.maxTokens || 2000;
    this.webSearch = config.webSearch ?? false;
  }

  async chat(
    system: string,
    messages: AIMessage[],
    options?: AIChatOptions,
  ): Promise<AIResponse> {
    const useWebSearch = options?.webSearch ?? this.webSearch;
    const model = options?.model || this.model;

    // OpenAI Responses API with web search tool
    if (useWebSearch && this.supportsWebSearch(model)) {
      const resp = await this.client.responses.create({
        model,
        instructions: system,
        tools: [{ type: 'web_search_preview' as any }],
        input: messages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      });

      const text = (resp.output || [])
        .filter((b: any) => b.type === 'message')
        .flatMap((b: any) => b.content || [])
        .filter((c: any) => c.type === 'output_text')
        .map((c: any) => c.text)
        .join('\n');

      return { text };
    }

    // Standard Chat Completions API
    const resp = await this.client.chat.completions.create({
      model,
      max_tokens: options?.maxTokens || this.maxTokens,
      messages: [
        { role: 'system', content: system },
        ...messages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
    });

    return { text: resp.choices[0]?.message?.content || '' };
  }

  async chatStream(
    system: string,
    messages: AIMessage[],
    onToken: (token: string) => void,
    options?: AIChatOptions,
  ): Promise<AIResponse> {
    const stream = await this.client.chat.completions.create({
      model: options?.model || this.model,
      max_tokens: options?.maxTokens || this.maxTokens,
      stream: true,
      messages: [
        { role: 'system', content: system },
        ...messages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
    });

    let fullText = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        onToken(delta);
      }
    }
    return { text: fullText };
  }

  private supportsWebSearch(model?: string): boolean {
    // Web search is available on gpt-4o and similar models
    const m = model || this.model;
    return m.startsWith('gpt-4') || m.startsWith('o') || m.startsWith('gpt-5');
  }
}
