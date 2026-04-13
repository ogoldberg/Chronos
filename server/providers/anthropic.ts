import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AIMessage, AIResponse, AIProviderConfig, AIChatOptions, AISource } from './types';

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
    options?: AIChatOptions,
  ): Promise<AIResponse> {
    const useWebSearch = options?.webSearch ?? this.webSearch;

    const msg = await this.client.messages.create({
      model: options?.model || this.model,
      max_tokens: options?.maxTokens || this.maxTokens,
      system,
      ...(useWebSearch
        ? { tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }] }
        : {}),
      messages: messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    });

    const textBlocks = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
    const text = textBlocks.map(b => b.text).join('\n');
    const sources = collectSources(textBlocks);
    const sourcesMd = formatSourcesMd(sources);

    return {
      text: sourcesMd ? `${text}\n\n${sourcesMd}` : text,
      sources,
    };
  }

  async chatStream(
    system: string,
    messages: AIMessage[],
    onToken: (token: string) => void,
    options?: AIChatOptions,
  ): Promise<AIResponse> {
    const useWebSearch = options?.webSearch ?? this.webSearch;

    const stream = this.client.messages.stream({
      model: options?.model || this.model,
      max_tokens: options?.maxTokens || this.maxTokens,
      system,
      ...(useWebSearch
        ? { tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }] }
        : {}),
      messages: messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    });

    let fullText = '';
    stream.on('text', (text) => {
      fullText += text;
      onToken(text);
    });

    const final = await stream.finalMessage();
    // Append a "Sources" footer after the stream completes. We emit it as
    // one final token so the client renders it as markdown alongside the
    // streamed body. Web_search citations live on the TextBlocks; we
    // dedupe by URL and format as a clickable markdown list.
    const textBlocks = final.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
    const sources = collectSources(textBlocks);
    const sourcesMd = formatSourcesMd(sources);
    if (sourcesMd) {
      const footer = `\n\n${sourcesMd}`;
      fullText += footer;
      onToken(footer);
    }
    return { text: fullText, sources };
  }
}

/**
 * Anthropic's web_search tool attaches a `citations` array to each
 * TextBlock. Each citation carries `{url, title, cited_text, ...}`.
 * Collect unique URLs across all blocks in response order so routes can
 * choose how to surface them: chat appends a markdown footer, structured-
 * JSON routes (insights, etc.) surface them as a separate field.
 */
function collectSources(blocks: Array<{ citations?: unknown }>): AISource[] {
  const seen = new Set<string>();
  const sources: AISource[] = [];
  for (const block of blocks) {
    const cites = (block.citations as Array<Record<string, unknown>> | undefined) || [];
    for (const c of cites) {
      const url = typeof c.url === 'string' ? c.url : null;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const title = typeof c.title === 'string' && c.title.trim() ? c.title.trim() : url;
      sources.push({ url, title });
    }
  }
  return sources;
}

function formatSourcesMd(sources: AISource[]): string {
  if (sources.length === 0) return '';
  const lines = sources.map((s, i) => `${i + 1}. [${s.title}](${s.url})`);
  return `**Sources**\n${lines.join('\n')}`;
}
