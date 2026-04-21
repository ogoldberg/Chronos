/**
 * POST /api/comparison-narrate — AI-generated comparative narration
 */

import { z } from 'zod';
import { getProviderForRequest } from '../../providers/index';
import { COMPARISON_NARRATE_SYSTEM } from '../../../src/ai/prompts';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import type { RouteHandler } from '../index';

const comparisonNarrateSchema = z.object({
  regions: z.array(z.string()).min(1).max(6),
  startYear: z.number(),
  endYear: z.number(),
  events: z.array(z.string()).optional().default([]),
});

export function registerComparisonRoutes(handleRoute: RouteHandler) {
  handleRoute('POST', '/api/comparison-narrate', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('comparison-narrate', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded' } };
    }
    const parsed = validate(comparisonNarrateSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };
    const { regions, startYear, endYear, events } = parsed.data;

    const ai = getProviderForRequest(reqHeaders);
    const systemPrompt = COMPARISON_NARRATE_SYSTEM(regions, startYear, endYear, events);
    const resp = await ai.chat(systemPrompt, [
      {
        role: 'user',
        content: `Generate a comparative narration for these regions: ${regions.join(', ')} during ${startYear} to ${endYear}. Visible events: ${events.join('; ') || 'none'}.`,
      },
    ], { maxTokens: 1000, webSearch: true });

    const jsonMatch = resp.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[0]);
        return { status: 200, data: { narration: data.narration ?? '', highlights: data.highlights ?? [] } };
      } catch { /* fall through */ }
    }
    // Fallback: return raw text as narration
    return { status: 200, data: { narration: resp.text, highlights: [] } };
  });
}
