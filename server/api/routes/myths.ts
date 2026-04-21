/**
 * POST /api/myths — historical myths and misconceptions
 */

import { z } from 'zod';
import { getProviderForRequest } from '../../providers/index';
import { MYTHS_SYSTEM } from '../../../src/ai/prompts';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import type { RouteHandler } from '../index';

const mythsSchema = z.object({
  centerYear: z.number(),
  span: z.number(),
});

export function registerMythsRoutes(handleRoute: RouteHandler) {
  handleRoute('POST', '/api/myths', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('myths', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }
    const parsed = validate(mythsSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };
    const { centerYear, span } = parsed.data;

    const ai = getProviderForRequest(reqHeaders);

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
