/**
 * POST /api/region — Explain what was happening in a geographic region
 * during a specific year/period. Backs the "click the globe to learn about
 * this region right now" feature in GlobePanel.
 */

import { z } from 'zod';
import { getProvider } from '../../providers/index';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import type { RouteHandler } from '../index';

const regionSchema = z.object({
  // Click location on the globe (required)
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  // Year the user is currently viewing on the timeline
  year: z.number(),
  // Optional human-readable region hint derived on the client (e.g. "Roman Empire",
  // "Europe", "East Asia"). When present we pass it through so the model has a
  // concrete anchor and doesn't have to re-derive it from lat/lng.
  regionName: z.string().max(80).optional(),
});

/**
 * Format a year into a compact human-readable label for prompting the model.
 * Examples: -3000 → "3000 BCE", 1117 → "1117 CE", -5e7 → "50 million years ago".
 */
function formatYearForPrompt(year: number): string {
  const a = Math.abs(year);
  if (a >= 1e9) return `${(a / 1e9).toFixed(1)} billion years ago`;
  if (a >= 1e6) return `${(a / 1e6).toFixed(1)} million years ago`;
  if (a >= 1e4) return `${Math.round(a / 1e3)}K ${year < 0 ? 'BCE' : 'CE'}`;
  if (year < 0) return `${Math.round(a)} BCE`;
  if (year === 0) return '1 CE';
  return `${Math.round(year)} CE`;
}

export function registerRegionRoutes(handleRoute: RouteHandler) {
  handleRoute('POST', '/api/region', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('region', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded' } };
    }

    const parsed = validate(regionSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };
    const { lat, lng, year, regionName } = parsed.data;

    const yearLabel = formatYearForPrompt(year);
    const locationHint = regionName
      ? `${regionName} (roughly ${lat.toFixed(1)}°, ${lng.toFixed(1)}°)`
      : `the region at ${lat.toFixed(1)}°, ${lng.toFixed(1)}°`;

    const ai = getProvider();
    const resp = await ai.chat(
      `You are a historian. Given a geographic location and a point in time, describe what was happening there. Respond in JSON only, no prose outside the JSON.

Schema:
{
  "placeName": "Concrete name of the place/civilization at that time (e.g. 'Song Dynasty China', 'Roman Britannia', 'Pre-Columbian Cahokia')",
  "summary": "2-4 sentence vivid description of life, politics, culture, or notable events in this place at this time. Use **bold** for 1-2 key phrases.",
  "highlights": ["3-5 short bullet facts"],
  "era": "Short era label, e.g. 'High Middle Ages' or 'Late Cretaceous'"
}

Rules:
- Be accurate and specific. If the year predates humans/civilization in that region, describe the geological, biological, or cosmic state instead.
- If the year is before Earth formed, describe the cosmic context.
- Never invent people or events.
- Keep summary under 450 characters.
- Use web search for corroboration when available.`,
      [
        {
          role: 'user',
          content: `What was happening in ${locationHint} around ${yearLabel}?`,
        },
      ],
      { maxTokens: 800, webSearch: true },
    );

    // Extract JSON object from the model's response. Providers occasionally wrap
    // their output in ```json fences or add a stray sentence — strip both.
    const text = resp.text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        status: 502,
        data: { error: 'Model did not return structured JSON', raw: text.slice(0, 500) },
      };
    }
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return { status: 200, data: parsed };
    } catch (e) {
      return {
        status: 502,
        data: { error: 'Failed to parse model JSON', raw: jsonMatch[0].slice(0, 500) },
      };
    }
  });
}
