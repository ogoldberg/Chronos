/**
 * POST /api/today — Today in History daily digest
 */

import { z } from 'zod';
import { getProvider } from '../../providers/index';
import { TODAY_IN_HISTORY_SYSTEM } from '../../prompts';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import type { RouteHandler } from '../index';

const todaySchema = z.object({
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
});

export function registerTodayRoutes(handleRoute: RouteHandler) {
  handleRoute('POST', '/api/today', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('today', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded' } };
    }
    const parsed = validate(todaySchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };
    const { month, day } = parsed.data;

    const ai = getProvider();
    const system = TODAY_IN_HISTORY_SYSTEM(month, day);
    const resp = await ai.chat(system, [{ role: 'user', content: `What happened on ${month}/${day} throughout history?` }], { maxTokens: 3000, webSearch: true });

    // Parse the JSON from the AI response
    let events: any[] = [];
    try {
      const text = resp.text.trim();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        events = JSON.parse(jsonMatch[0]);
      }
    } catch {
      return { status: 500, data: { error: 'Failed to parse AI response' } };
    }

    return { status: 200, data: { events } };
  });
}
