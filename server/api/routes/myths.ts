/**
 * POST /api/myths — historical myths and misconceptions
 */

import { getProvider } from '../../providers/index';
import { MYTHS_SYSTEM } from '../../prompts';
import { checkRateLimit } from '../middleware/rateLimit';
import type { RouteHandler } from '../index';

export function registerMythsRoutes(handleRoute: RouteHandler) {
  handleRoute('POST', '/api/myths', null, async (body) => {
    if (!checkRateLimit('myths')) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }
    const ai = getProvider();
    const { centerYear, span } = body;
    if (typeof centerYear !== 'number' || typeof span !== 'number') {
      return { status: 400, data: { error: 'centerYear and span are required numbers.' } };
    }

    const system = MYTHS_SYSTEM(centerYear, span);
    const resp = await ai.chat(system, [
      { role: 'user', content: `Generate 3 historical myths/misconceptions for the period around year ${centerYear} (span: ${span} years).` },
    ], { maxTokens: 1500, webSearch: true });

    const jsonMatch = resp.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const myths = JSON.parse(jsonMatch[0]);
        if (Array.isArray(myths)) {
          return { status: 200, data: { myths } };
        }
      } catch { /* fall through */ }
    }
    return { status: 200, data: { myths: [] } };
  });
}
