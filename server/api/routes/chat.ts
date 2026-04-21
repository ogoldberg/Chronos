/**
 * POST /api/chat — non-streaming chat
 * POST /api/chat/stream — streaming chat via SSE (handled separately)
 */

import { z } from 'zod';
import { getProviderForRequest, MissingAPIKeyError } from '../../providers/index';
import { CHAT_SYSTEM } from '../../prompts';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import type { RouteHandler } from '../index';

const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.string(),
    content: z.string().max(8000, 'Each message content must be under 8000 chars'),
  })).min(1).max(20, 'messages must be an array of 1-20 items'),
  context: z.string().optional(),
});

export function registerChatRoutes(handleRoute: RouteHandler) {
  handleRoute('POST', '/api/chat', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('chat', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded' } };
    }
    const parsed = validate(chatSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };
    const { messages, context } = parsed.data;

    const ai = getProviderForRequest(reqHeaders);
    const system = CHAT_SYSTEM(context);
    const resp = await ai.chat(system, messages, { maxTokens: 2000, webSearch: true });
    return { status: 200, data: { content: resp.text } };
  });
}

/** Handle streaming chat via Server-Sent Events */
export async function handleStreamRequest(body: any, res: any, reqHeaders: Record<string, string | string[] | undefined> = {}): Promise<void> {
  if (!checkRateLimit('chat-stream', getClientIP(reqHeaders))) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
    return;
  }
  let ai;
  try {
    ai = getProviderForRequest(reqHeaders);
  } catch (err: unknown) {
    if (err instanceof MissingAPIKeyError) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing_api_key', provider: err.provider, message: err.message }));
      return;
    }
    throw err;
  }
  const { messages, context } = body;
  const system = CHAT_SYSTEM(context);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Detect client disconnect to stop generating tokens
  let aborted = false;
  res.on('close', () => { aborted = true; });

  try {
    await ai.chatStream(system, messages, (token) => {
      if (aborted) return;
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }, { maxTokens: 2000, webSearch: true });

    if (!aborted) res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err: any) {
    if (!aborted) res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }
  if (!aborted) res.end();
}
