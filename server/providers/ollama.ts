import type { AIProvider, AIMessage, AIResponse, AIProviderConfig } from './types';

/**
 * Ollama provider — uses the OpenAI-compatible API that Ollama exposes.
 * No SDK dependency needed, just fetch.
 */
export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  private baseUrl: string;
  private model: string;
  private maxTokens: number;

  constructor(config: AIProviderConfig) {
    this.baseUrl = config.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = config.model || 'llama3.1';
    this.maxTokens = config.maxTokens || 2000;
  }

  async chat(
    system: string,
    messages: AIMessage[],
    options?: { maxTokens?: number },
  ): Promise<AIResponse> {
    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        options: {
          num_predict: options?.maxTokens || this.maxTokens,
        },
        messages: [
          { role: 'system', content: system },
          ...messages.map(m => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!resp.ok) {
      throw new Error(`Ollama error: ${resp.status} ${await resp.text()}`);
    }

    const data = await resp.json();
    return { text: data.message?.content || '' };
  }

  async chatStream(
    system: string,
    messages: AIMessage[],
    onToken: (token: string) => void,
    options?: { maxTokens?: number },
  ): Promise<AIResponse> {
    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: true,
        options: { num_predict: options?.maxTokens || this.maxTokens },
        messages: [
          { role: 'system', content: system },
          ...messages.map(m => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!resp.ok || !resp.body) {
      throw new Error(`Ollama error: ${resp.status}`);
    }

    let fullText = '';
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value, { stream: true }).split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.message?.content) {
            fullText += data.message.content;
            onToken(data.message.content);
          }
        } catch { /* skip malformed lines */ }
      }
    }
    return { text: fullText };
  }
}
