import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIProvider, AIMessage, AIResponse, AIProviderConfig, AIChatOptions } from './types';

export class GoogleProvider implements AIProvider {
  readonly name = 'google';
  private genAI: GoogleGenerativeAI;
  private model: string;
  private maxTokens: number;

  constructor(config: AIProviderConfig) {
    const apiKey = config.apiKey || process.env.GOOGLE_AI_API_KEY || '';
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = config.model || 'gemini-2.0-flash';
    this.maxTokens = config.maxTokens || 2000;
  }

  async chat(
    system: string,
    messages: AIMessage[],
    options?: AIChatOptions,
  ): Promise<AIResponse> {
    const model = this.genAI.getGenerativeModel({
      model: options?.model || this.model,
      systemInstruction: system,
      generationConfig: {
        maxOutputTokens: options?.maxTokens || this.maxTokens,
      },
    });

    // Convert message history to Gemini format
    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });
    const lastMsg = messages[messages.length - 1];
    const result = await chat.sendMessage(lastMsg?.content || '');

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
      generationConfig: {
        maxOutputTokens: options?.maxTokens || this.maxTokens,
      },
    });

    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });
    const lastMsg = messages[messages.length - 1];
    const result = await chat.sendMessageStream(lastMsg?.content || '');

    let fullText = '';
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        fullText += text;
        onToken(text);
      }
    }
    return { text: fullText };
  }
}
