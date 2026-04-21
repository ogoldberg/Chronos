/**
 * Google Gemini provider — `@google/generative-ai` is browser-compatible
 * out of the box; no special flag needed.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIProvider, AIMessage, AIResponse, AIChatOptions } from '../types';

interface Config {
  apiKey: string;
  model: string;
}

export class GoogleClientProvider implements AIProvider {
  readonly name = 'google';
  private genAI: GoogleGenerativeAI;
  private model: string;

  constructor(config: Config) {
    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.model = config.model;
  }

  async chat(system: string, messages: AIMessage[], options?: AIChatOptions): Promise<AIResponse> {
    const model = this.genAI.getGenerativeModel({
      model: options?.model || this.model,
      systemInstruction: system,
      generationConfig: { maxOutputTokens: options?.maxTokens || 2000 },
    });
    // Gemini expects a "contents" array with role/parts. Re-map from our
    // simple role/content shape and treat "assistant" as "model".
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const result = await model.generateContent({ contents });
    return { text: result.response.text() };
  }

  async chatStream(
    system: string,
    messages: AIMessage[],
    onToken: (token: string) => void,
    options?: AIChatOptions,
  ): Promise<AIResponse> {
    const model = this.genAI.getGenerativeModel({
      model: options?.model || this.model,
      systemInstruction: system,
      generationConfig: { maxOutputTokens: options?.maxTokens || 2000 },
    });
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const result = await model.generateContentStream({ contents });
    let text = '';
    for await (const chunk of result.stream) {
      const token = chunk.text();
      if (token) {
        text += token;
        onToken(token);
      }
    }
    return { text };
  }
}
