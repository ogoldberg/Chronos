/**
 * POST /api/reading — AI-generated curated reading list
 */

import { z } from 'zod';
import { getProviderForRequest } from '../../providers/index';
import { READING_LIST_SYSTEM } from '../../../src/ai/prompts';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import type { RouteHandler } from '../index';

const ReadingRequestSchema = z.object({
  topic: z.string().min(1, 'Topic is required').max(500, 'Topic must be under 500 characters'),
});

export function registerReadingRoutes(handleRoute: RouteHandler) {
  handleRoute('POST', '/api/reading', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('reading', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }

    const validation = validate(ReadingRequestSchema, body);
    if (!validation.success) {
      return { status: 400, data: { error: validation.error } };
    }

    const { topic } = validation.data;
    const ai = getProviderForRequest(reqHeaders);
    const system = READING_LIST_SYSTEM(topic.trim());

    const resp = await ai.chat(system, [
      { role: 'user', content: `Generate a curated reading list for: "${topic.trim()}"` },
    ], { maxTokens: 3000, webSearch: true });

    // Try to extract JSON array of items
    const jsonMatch = resp.text.match(/\{[\s\S]*"items"\s*:\s*\[[\s\S]*\]\s*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.items?.length) {
          return { status: 200, data: { items: parsed.items } };
        }
      } catch { /* fall through */ }
    }

    // Fallback: try any JSON with an array
    const arrayMatch = resp.text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { status: 200, data: { items: parsed } };
        }
      } catch { /* fall through */ }
    }

    return { status: 200, data: { items: [] } };
  });
}
