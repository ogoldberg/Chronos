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

/**
 * A single web source cited by the model. Populated by providers whose
 * web_search tool returns URL + title per citation (currently Anthropic).
 * Routes that return structured JSON (insights, discover, etc.) surface
 * this list separately instead of appending a markdown footer to `text`.
 */
export interface AISource {
  url: string;
  title: string;
}

export interface AIResponse {
  text: string;
  /** If the provider did tool calls (e.g. web search), raw results */
  toolResults?: string[];
  /** Deduped list of web sources cited during this response, in order of first appearance. */
  sources?: AISource[];
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

/**
 * Per-call options. `model` is a provider-specific model ID override that
 * lets individual routes pick a different (usually cheaper + faster) model
 * for their specific use case without changing the global config. Useful
 * for narrow tasks like primary-source discovery where Haiku-tier quality
 * is plenty and per-call cost matters at scale.
 */
export interface AIChatOptions {
  maxTokens?: number;
  webSearch?: boolean;
  model?: string;
}

/**
 * Thrown when a route would call the AI provider but no user API key was
 * supplied. The route dispatcher converts this to a 401 response with a
 * structured body so the client can prompt the user to open Settings.
 *
 * We deliberately have no server-side fallback key. Every AI request must
 * carry a user-owned key, which means costs and rate limits belong to the
 * user rather than the app operator.
 */
export class MissingAPIKeyError extends Error {
  readonly kind = 'missing_api_key';
  readonly provider: string;
  constructor(provider: string) {
    super(`No API key provided for ${provider}. Users must supply their own key via the Settings panel.`);
    this.provider = provider;
  }
}

export interface AIProvider {
  readonly name: string;

  /**
   * Send a message and get a text response.
   */
  chat(
    system: string,
    messages: AIMessage[],
    options?: AIChatOptions,
  ): Promise<AIResponse>;

  /**
   * Stream a response token by token.
   * Calls onToken for each chunk, returns the full text when done.
   */
  chatStream(
    system: string,
    messages: AIMessage[],
    onToken: (token: string) => void,
    options?: AIChatOptions,
  ): Promise<AIResponse>;
}
