/**
 * POST /api/quiz — generate history quiz questions
 */

import { getProvider } from '../../providers/index';
import { QUIZ_SYSTEM } from '../../prompts';
import { checkRateLimit } from '../middleware/rateLimit';
import type { RouteHandler } from '../index';

export function registerQuizRoutes(handleRoute: RouteHandler) {
  handleRoute('POST', '/api/quiz', null, async (body) => {
    if (!checkRateLimit('quiz')) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }
    const ai = getProvider();
    const { events = [], era = 'modern' } = body;
    if (!Array.isArray(events)) {
      return { status: 400, data: { error: 'events must be an array of strings.' } };
    }

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
