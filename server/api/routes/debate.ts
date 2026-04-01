/**
 * POST /api/debate — AI-powered historical debate with two perspectives
 */

import { z } from 'zod';
import { getProvider } from '../../providers/index';
import { DEBATE_SYSTEM } from '../../prompts';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import type { RouteHandler } from '../index';

const DebateRequestSchema = z.object({
  topic: z.string().min(1, 'Topic is required').max(300, 'Topic must be under 300 characters'),
});

export function registerDebateRoutes(handleRoute: RouteHandler) {
  handleRoute('POST', '/api/debate', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('debate', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }

    const validation = validate(DebateRequestSchema, body);
    if (!validation.success) {
      return { status: 400, data: { error: validation.error } };
    }

    const { topic } = validation.data;
    const ai = getProvider();
    const system = DEBATE_SYSTEM(topic.trim());

    const resp = await ai.chat(system, [
      { role: 'user', content: `Generate a structured historical debate on: "${topic.trim()}"` },
    ], { maxTokens: 4000, webSearch: true });

    // Try to extract the JSON object with perspectiveA, perspectiveB, synthesis
    const jsonMatch = resp.text.match(/\{[\s\S]*"perspectiveA"\s*:\s*\{[\s\S]*"perspectiveB"\s*:\s*\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.perspectiveA && parsed.perspectiveB) {
          return {
            status: 200,
            data: {
              perspectiveA: parsed.perspectiveA,
              perspectiveB: parsed.perspectiveB,
              synthesis: parsed.synthesis || '',
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
        if (parsed.perspectiveA && parsed.perspectiveB) {
          return {
            status: 200,
            data: {
              perspectiveA: parsed.perspectiveA,
              perspectiveB: parsed.perspectiveB,
              synthesis: parsed.synthesis || '',
            },
          };
        }
      } catch { /* fall through */ }
    }

    return { status: 200, data: { perspectiveA: null, perspectiveB: null, synthesis: '' } };
  });
}
