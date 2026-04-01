/**
 * POST /api/parallels — find historical parallels
 */

import { getProvider } from '../../providers/index';
import { PARALLELS_SYSTEM } from '../../prompts';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import type { RouteHandler } from '../index';

export function registerParallelsRoutes(handleRoute: RouteHandler) {
  handleRoute('POST', '/api/parallels', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('parallels', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }
    const ai = getProvider();
    const { query, context } = body;
    if (!query || typeof query !== 'string' || !query.trim()) {
      return { status: 400, data: { error: 'A query string is required.' } };
    }

    const system = PARALLELS_SYSTEM(query.trim(), context);
    const resp = await ai.chat(system, [
      { role: 'user', content: `Find historical parallels for: "${query.trim()}"` },
    ], { maxTokens: 3000, webSearch: true });

    // Try to extract the JSON object with events
    const jsonObjMatch = resp.text.match(/\{[\s\S]*"events"\s*:\s*\[[\s\S]*\]\s*\}/);
    if (jsonObjMatch) {
      try {
        const parsed = JSON.parse(jsonObjMatch[0]);
        if (Array.isArray(parsed.events)) {
          return { status: 200, data: { events: parsed.events } };
        }
      } catch { /* fall through to array match */ }
    }

    // Fallback: try to extract a bare JSON array
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
