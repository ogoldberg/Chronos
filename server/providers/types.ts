/**
 * Model-agnostic AI provider interface.
 *
 * Every provider implements this interface. The app never touches
 * SDK-specific types — it only uses these abstractions.
 */

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIResponse {
  text: string;
  /** If the provider did tool calls (e.g. web search), raw results */
  toolResults?: string[];
}

export interface AIProviderConfig {
  /** Which provider: anthropic, openai, google, ollama */
  provider: string;
  /** Model ID (e.g. "claude-sonnet-4-20250514", "gpt-4o", "gemini-2.0-flash") */
  model: string;
  /** API key (read from env if not provided) */
  apiKey?: string;
  /** Base URL override (for Ollama, Azure, proxies) */
  baseUrl?: string;
  /** Max tokens for responses */
  maxTokens?: number;
  /** Enable web search tool if provider supports it */
  webSearch?: boolean;
}

export interface AIProvider {
  readonly name: string;

  /**
   * Send a message and get a text response.
   * @param system - System prompt
   * @param messages - Conversation history
   * @param options - Per-request overrides
   */
  chat(
    system: string,
    messages: AIMessage[],
    options?: { maxTokens?: number; webSearch?: boolean },
  ): Promise<AIResponse>;
}
