/**
 * Shared AI provider types — mirrors the former server-side interface
 * but lives in the client bundle now that every AI call runs in the
 * browser directly against the provider's API.
 */

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AISource {
  url: string;
  title: string;
}

export interface AIResponse {
  text: string;
  sources?: AISource[];
}

export interface AIChatOptions {
  maxTokens?: number;
  /** Hint for providers that support a web_search tool. */
  webSearch?: boolean;
  /** Per-call model override. Useful when a feature can afford a
   *  cheaper/faster model than the user's default. */
  model?: string;
  /** Abort signal for request cancellation. */
  signal?: AbortSignal;
}

export interface AIProvider {
  readonly name: string;
  chat(system: string, messages: AIMessage[], options?: AIChatOptions): Promise<AIResponse>;
  chatStream(
    system: string,
    messages: AIMessage[],
    onToken: (token: string) => void,
    options?: AIChatOptions,
  ): Promise<AIResponse>;
}
