/**
 * POST /api/insights — AI-generated era insights
 */

import { z } from 'zod';
import { getProvider } from '../../providers/index';
import { INSIGHTS_SYSTEM } from '../../prompts';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import type { RouteHandler } from '../index';

const insightsSchema = z.object({
  centerYear: z.number(),
  span: z.number(),
  visibleEvents: z.array(z.string()).optional().default([]),
});

export function registerInsightsRoutes(handleRoute: RouteHandler) {
  handleRoute('POST', '/api/insights', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('insights', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded' } };
    }
    const parsed = validate(insightsSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };
    const { centerYear, span, visibleEvents } = parsed.data;

    const ai = getProvider();
    const resp = await ai.chat(INSIGHTS_SYSTEM, [
      { role: 'user', content: `Time period centered on year ${centerYear} (span: ${span} years). Visible events: ${visibleEvents.join(', ') || 'none'}. Give me 3 fascinating facts about this era.` },
    ], { maxTokens: 500, webSearch: true });

    const jsonMatch = resp.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try { return { status: 200, data: { insights: JSON.parse(jsonMatch[0]) } }; }
      catch { /* fall through */ }
    }
    return { status: 200, data: { insights: [] } };
  });
}
