/**
 * Ollama provider — hits a local Ollama HTTP server directly from the
 * browser. Default base URL is http://localhost:11434 which only works
 * when Ollama was started with `OLLAMA_ORIGINS=*` (or similar) so the
 * browser's CORS check passes. We can't do anything about that — it's
 * a property of the user's local install.
 */

import type { AIProvider, AIMessage, AIResponse, AIChatOptions } from '../types';

interface Config {
  model: string;
  baseUrl?: string;
}

export class OllamaClientProvider implements AIProvider {
  readonly name = 'ollama';
  private model: string;
  private baseUrl: string;

  constructor(config: Config) {
    this.model = config.model;
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
  }

  async chat(system: string, messages: AIMessage[], options?: AIChatOptions): Promise<AIResponse> {
    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options?.model || this.model,
        stream: false,
        messages: [{ role: 'system', content: system }, ...messages],
      }),
      signal: options?.signal,
    });
    if (!resp.ok) throw new Error(`Ollama error: ${resp.status}`);
    const data = await resp.json() as { message?: { content?: string } };
    return { text: data.message?.content || '' };
  }

  async chatStream(
    system: string,
    messages: AIMessage[],
    onToken: (token: string) => void,
    options?: AIChatOptions,
  ): Promise<AIResponse> {
    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options?.model || this.model,
        stream: true,
        messages: [{ role: 'system', content: system }, ...messages],
      }),
      signal: options?.signal,
    });
    if (!resp.ok || !resp.body) throw new Error(`Ollama error: ${resp.status}`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // Ollama streams newline-delimited JSON objects.
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as { message?: { content?: string } };
          const token = parsed.message?.content || '';
          if (token) { text += token; onToken(token); }
        } catch { /* tolerate partials */ }
      }
    }
    return { text };
  }
}
