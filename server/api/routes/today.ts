/**
 * Today in History routes
 *
 * GET  /api/today?month=M&day=D       — curated events from Wikipedia + Wikidata (fast, free)
 * POST /api/today/detail               — AI-enriched detail for a single event (on-demand)
 * POST /api/today/explore              — all events grouped by theme
 */

import { z } from 'zod';
import { getProviderForRequest } from '../../providers/index';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { getOnThisDayEvents, getAllOnThisDayEvents } from '../../services/onThisDay';
import type { RouteHandler } from '../index';

const dateSchema = z.object({
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
});

const detailSchema = z.object({
  year: z.number(),
  title: z.string(),
  description: z.string(),
  wikiTitle: z.string().optional(),
});

export function registerTodayRoutes(handleRoute: RouteHandler) {
  // ── Fast path: curated events from Wikipedia + Wikidata ────────────
  handleRoute('POST', '/api/today', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('today', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded' } };
    }
    const parsed = validate(dateSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };
    const { month, day } = parsed.data;

    try {
      const { curated, total } = await getOnThisDayEvents(month, day);
      return {
        status: 200,
        data: { events: curated, total, source: 'wikipedia+wikidata' },
      };
    } catch (err: any) {
      console.error('[today] Failed to fetch on-this-day events:', err.message);
      return { status: 500, data: { error: 'Failed to fetch historical events' } };
    }
  });

  // ── AI detail: enrich a single event on user interaction ──────────
  handleRoute('POST', '/api/today/detail', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('today-detail', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded' } };
    }
    const parsed = validate(detailSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };
    const { year, title, description, wikiTitle } = parsed.data;

    const ai = getProviderForRequest(reqHeaders);
    const prompt = `You are a historian providing an engaging, concise deep-dive on a historical event.

Event: "${title}" (${year < 0 ? `${Math.abs(year)} BCE` : year})
Context: ${description}
${wikiTitle ? `Wikipedia article: ${wikiTitle}` : ''}

Provide a response as JSON with these fields:
{
  "narrative": "2-3 sentence vivid narrative of what happened and why it mattered",
  "significance": "One sentence on the lasting historical impact",
  "connections": ["1-3 related events or consequences, each as a short string"],
  "funFact": "One surprising or lesser-known detail about this event"
}

Return ONLY valid JSON, no other text.`;

    try {
      const resp = await ai.chat(
        'You are a concise historian. Return only valid JSON.',
        [{ role: 'user', content: prompt }],
        { maxTokens: 500, webSearch: false },
      );

      const text = resp.text.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { status: 500, data: { error: 'Failed to parse AI response' } };
      }
      const detail = JSON.parse(jsonMatch[0]);
      // Strip <cite> tags and other markup from AI response values
      const stripCites = (s: string) => s.replace(/<cite[^>]*>.*?<\/cite>/g, '').replace(/<[^>]+>/g, '').trim();
      if (detail.narrative) detail.narrative = stripCites(detail.narrative);
      if (detail.significance) detail.significance = stripCites(detail.significance);
      if (detail.funFact) detail.funFact = stripCites(detail.funFact);
      if (Array.isArray(detail.connections)) {
        detail.connections = detail.connections.map((c: string) => typeof c === 'string' ? stripCites(c) : c);
      }
      return { status: 200, data: { detail } };
    } catch (err: any) {
      console.error('[today/detail] AI enrichment failed:', err.message);
      return { status: 500, data: { error: 'Failed to generate event detail' } };
    }
  });

  // ── Explore: all events grouped by theme ──────────────────────────
  handleRoute('POST', '/api/today/explore', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('today', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded' } };
    }
    const parsed = validate(dateSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };
    const { month, day } = parsed.data;

    try {
      const result = await getAllOnThisDayEvents(month, day);
      return { status: 200, data: result };
    } catch (err: any) {
      console.error('[today/explore] Failed:', err.message);
      return { status: 500, data: { error: 'Failed to fetch events' } };
    }
  });
}
