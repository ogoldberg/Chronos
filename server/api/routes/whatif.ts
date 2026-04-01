/**
 * POST /api/whatif — counterfactual alternate history explorer
 */

import { z } from 'zod';
import { getProvider } from '../../providers/index';
import { WHATIF_SYSTEM } from '../../prompts';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import type { RouteHandler } from '../index';

const whatifSchema = z.object({
  question: z.string().min(1, 'A "question" string is required.').max(300, 'Question must be under 300 characters.'),
});

export function registerWhatifRoutes(handleRoute: RouteHandler) {
  handleRoute('POST', '/api/whatif', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('whatif', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }
    const parsed = validate(whatifSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };
    const { question } = parsed.data;

    const ai = getProvider();

    const system = WHATIF_SYSTEM(question.trim());
    const resp = await ai.chat(system, [
      { role: 'user', content: `Generate a speculative alternate history timeline for: "${question.trim()}"` },
    ], { maxTokens: 3000, webSearch: true });

    const jsonObjMatch = resp.text.match(/\{[\s\S]*"events"\s*:\s*\[[\s\S]*\]\s*\}/);
    if (jsonObjMatch) {
      try {
        const parsed = JSON.parse(jsonObjMatch[0]);
        if (Array.isArray(parsed.events)) {
          return { status: 200, data: { events: parsed.events } };
        }
      } catch { /* fall through */ }
    }

    const jsonArrMatch = resp.text.match(/\[[\s\S]*\]/);
    if (jsonArrMatch) {
      try {
        const events = JSON.parse(jsonArrMatch[0]);
        if (Array.isArray(events)) {
          return { status: 200, data: { events } };
        }
      } catch { /* fall through */ }
    }

    return { status: 200, data: { events: [] } };
  });
}
