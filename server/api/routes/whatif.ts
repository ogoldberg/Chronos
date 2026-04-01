/**
 * POST /api/whatif — counterfactual alternate history explorer
 */

import { getProvider } from '../../providers/index';
import { WHATIF_SYSTEM } from '../../prompts';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import type { RouteHandler } from '../index';

export function registerWhatifRoutes(handleRoute: RouteHandler) {
  handleRoute('POST', '/api/whatif', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('whatif', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }
    const ai = getProvider();
    const { question } = body;
    if (!question || typeof question !== 'string' || !question.trim()) {
      return { status: 400, data: { error: 'A "question" string is required.' } };
    }
    if (question.length > 300) {
      return { status: 400, data: { error: 'Question must be under 300 characters.' } };
    }

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
