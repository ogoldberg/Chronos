/**
 * POST /api/nearby — Find historical events near a geographic location
 */

import { z } from 'zod';
import { getProvider } from '../../providers/index';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import type { RouteHandler } from '../index';

const nearbySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius: z.number().min(1).max(500).optional().default(50),
});

export function registerNearbyRoutes(handleRoute: RouteHandler) {
  handleRoute('POST', '/api/nearby', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('nearby', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded' } };
    }

    const parsed = validate(nearbySchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };
    const { lat, lng, radius } = parsed.data;

    const ai = getProvider();
    const resp = await ai.chat(
      `You are a historian. Given geographic coordinates, list 6-8 significant historical events that occurred near that location (within ${radius}km). Include events from different eras.

Return ONLY a JSON array:
[{"title":"Event","year":1234,"emoji":"🎯","description":"One sentence.","distance":12.5,"wiki":"Wikipedia_Title"}]

Rules:
- Events must be REAL and verifiable
- Include distance estimate in km from the given coordinates
- Spread across different time periods
- Use web search to verify`,
      [{ role: 'user', content: `Find historical events near latitude ${lat}, longitude ${lng} (within ${radius}km radius).` }],
      { maxTokens: 1500, webSearch: true }
    );

    const jsonMatch = resp.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const events = JSON.parse(jsonMatch[0]);
        return { status: 200, data: { events } };
      } catch { /* fall through */ }
    }
    return { status: 200, data: { events: [] } };
  });
}
