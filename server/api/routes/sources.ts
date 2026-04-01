/**
 * POST /api/sources/compare — AI-powered source comparison across historiographic traditions
 */

import { z } from 'zod';
import { getProvider } from '../../providers/index';
import { SOURCE_COMPARISON_SYSTEM } from '../../prompts';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import type { RouteHandler } from '../index';

const SourcesRequestSchema = z.object({
  topic: z.string().min(1, 'Topic is required').max(300, 'Topic must be under 300 characters'),
});

export function registerSourcesRoutes(handleRoute: RouteHandler) {
  handleRoute('POST', '/api/sources/compare', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('sources', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }

    const validation = validate(SourcesRequestSchema, body);
    if (!validation.success) {
      return { status: 400, data: { error: validation.error } };
    }

    const { topic } = validation.data;
    const ai = getProvider();
    const system = SOURCE_COMPARISON_SYSTEM(topic.trim());

    const resp = await ai.chat(system, [
      { role: 'user', content: `Compare different historical perspectives on: "${topic.trim()}"` },
    ], { maxTokens: 4000, webSearch: true });

    // Try to extract JSON object with perspectives array
    const jsonMatch = resp.text.match(/\{[\s\S]*"perspectives"\s*:\s*\[[\s\S]*\][\s\S]*"consensus"\s*:[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.perspectives?.length) {
          return {
            status: 200,
            data: {
              perspectives: parsed.perspectives,
              consensus: parsed.consensus || '',
            },
          };
        }
      } catch { /* fall through */ }
    }

    // Fallback: try any top-level JSON object
    const fallbackMatch = resp.text.match(/\{[\s\S]*\}/);
    if (fallbackMatch) {
      try {
        const parsed = JSON.parse(fallbackMatch[0]);
        if (parsed.perspectives?.length) {
          return {
            status: 200,
            data: {
              perspectives: parsed.perspectives,
              consensus: parsed.consensus || '',
            },
          };
        }
      } catch { /* fall through */ }
    }

    return { status: 200, data: { perspectives: [], consensus: '' } };
  });
}
