/**
 * GET /api/user/progress — load user progress
 * POST /api/user/progress — save user progress
 * POST /api/seed — seed anchor events into DB
 */

import { z } from 'zod';
import { getUserProgress, saveUserProgress, upsertEvent } from '../../db';
import { getAuth } from '../../auth';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { ANCHOR_EVENTS } from '../../../src/data/anchorEvents.ts';
import type { RouteHandler } from '../index';

const progressSchema = z.object({
  xp: z.number().optional(),
  level: z.number().optional(),
  completedUnits: z.array(z.string()).optional(),
  quizScores: z.record(z.string(), z.number()).optional(),
  badges: z.array(z.string()).optional(),
}).passthrough();

const seedSchema = z.object({
  adminKey: z.string(),
});

export function registerUserRoutes(handleRoute: RouteHandler, dbReady: () => boolean) {
  handleRoute('GET', '/api/user/progress', null, async (_body, _url, reqHeaders) => {
    if (!dbReady()) {
      return { status: 503, data: { error: 'Database not available' } };
    }
    const authInstance = getAuth();
    if (!authInstance) {
      return { status: 401, data: { error: 'Auth not configured' } };
    }
    const headers = new Headers(reqHeaders as Record<string, string>);
    const session = await authInstance.api.getSession({ headers });
    if (!session?.user?.id) {
      return { status: 401, data: { error: 'Not authenticated' } };
    }
    const progress = await getUserProgress(session.user.id);
    return { status: 200, data: { progress } };
  });

  handleRoute('POST', '/api/user/progress', null, async (body, _url, reqHeaders) => {
    if (!dbReady()) {
      return { status: 503, data: { error: 'Database not available' } };
    }
    const authInstance = getAuth();
    if (!authInstance) {
      return { status: 401, data: { error: 'Auth not configured' } };
    }
    const headers = new Headers(reqHeaders as Record<string, string>);
    const session = await authInstance.api.getSession({ headers });
    if (!session?.user?.id) {
      return { status: 401, data: { error: 'Not authenticated' } };
    }
    const parsed = validate(progressSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };
    await saveUserProgress(session.user.id, parsed.data);
    return { status: 200, data: { ok: true } };
  });

  handleRoute('POST', '/api/seed', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('seed', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }
    const parsedSeed = validate(seedSchema, body);
    if (!parsedSeed.success) return { status: 400, data: { error: parsedSeed.error } };

    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey) {
      return { status: 403, data: { error: 'ADMIN_KEY not configured — seed endpoint disabled' } };
    }
    if (parsedSeed.data.adminKey !== adminKey) {
      return { status: 403, data: { error: 'Invalid admin key' } };
    }
    if (!dbReady()) {
      return { status: 503, data: { error: 'Database not available' } };
    }

    let seeded = 0;
    for (const event of ANCHOR_EVENTS) {
      await upsertEvent({
        id: event.id,
        title: event.title,
        year: event.year,
        timestamp: event.timestamp || undefined,
        precision: event.precision || 'year',
        emoji: event.emoji,
        color: event.color,
        description: event.description,
        category: event.category,
        source: 'anchor',
        wiki: event.wiki,
        lat: event.lat,
        lng: event.lng,
        geo_type: event.geoType,
        path: event.path,
        region: event.region,
        max_span: event.maxSpan,
        verified: true,
      });
      seeded++;
    }
    return { status: 200, data: { ok: true, seeded } };
  });
}
