/**
 * POST /api/quiz — generate history quiz questions
 */

import { z } from 'zod';
import { getProvider } from '../../providers/index';
import { QUIZ_SYSTEM } from '../../prompts';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import type { RouteHandler } from '../index';

const quizSchema = z.object({
  events: z.array(z.string()).optional().default([]),
  era: z.string().optional().default('modern'),
});

export function registerQuizRoutes(handleRoute: RouteHandler) {
  handleRoute('POST', '/api/quiz', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('quiz', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }
    const parsed = validate(quizSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };
    const { events, era } = parsed.data;

    const ai = getProvider();

    const system = QUIZ_SYSTEM(events.slice(0, 10), era);
    const resp = await ai.chat(system, [
      { role: 'user', content: `Generate a history quiz question about ${era} era events.` },
    ], { maxTokens: 800 });

    const jsonMatch = resp.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.question && Array.isArray(parsed.options) && parsed.options.length === 4 && typeof parsed.correctIndex === 'number') {
          return { status: 200, data: parsed };
        }
      } catch { /* fall through */ }
    }
    return { status: 500, data: { error: 'Failed to generate quiz question. Try again.' } };
  });
}
