/**
 * Community routes:
 * GET  /api/community/lenses     — list public lenses
 * GET  /api/community/tours      — list public tours
 * POST /api/community/lenses/share  — make a lens public (auth)
 * POST /api/community/tours/share   — make a tour public (auth)
 * POST /api/community/vote          — upvote/downvote an event (auth, rate limited)
 */

import { getAuth } from '../../auth';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import type { RouteHandler } from '../index';

/* ------------------------------------------------------------------ */
/*  In-memory stores (would use DB tables in production)               */
/* ------------------------------------------------------------------ */

interface PublicLens {
  id: string;
  emoji: string;
  name: string;
  description: string;
  creator: string;
  useCount: number;
  color: string;
  tags: string[];
  isPublic: boolean;
}

interface PublicTour {
  id: string;
  title: string;
  description: string;
  stopCount: number;
  playCount: number;
  creator: string;
  isPublic: boolean;
}

interface EventVote {
  eventId: string;
  userId: string;
  vote: 1 | -1;
}

const publicLenses: PublicLens[] = [];
const publicTours: PublicTour[] = [];
const eventVotes: EventVote[] = [];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function getSessionUser(reqHeaders?: Record<string, string | string[] | undefined>): Promise<{ id: string; name?: string } | null> {
  const authInstance = getAuth();
  if (!authInstance) return null;
  try {
    const headers = new Headers(reqHeaders as Record<string, string>);
    const session = await authInstance.api.getSession({ headers });
    if (session?.user?.id) return { id: session.user.id, name: (session.user as any).name || 'Anonymous' };
  } catch { /* ignore */ }
  return null;
}

function getNetVotes(eventId: string): number {
  return eventVotes
    .filter(v => v.eventId === eventId)
    .reduce((sum, v) => sum + v.vote, 0);
}

/* ------------------------------------------------------------------ */
/*  Route registration                                                 */
/* ------------------------------------------------------------------ */

export function registerCommunityRoutes(handleRoute: RouteHandler) {
  /* ---- List public lenses ---- */
  handleRoute('GET', '/api/community/lenses', null, async () => {
    const lenses = publicLenses
      .filter(l => l.isPublic)
      .map(l => ({
        id: l.id,
        emoji: l.emoji,
        name: l.name,
        description: l.description,
        creator: l.creator,
        useCount: l.useCount,
        color: l.color,
        tags: l.tags,
      }));
    return { status: 200, data: { lenses } };
  });

  /* ---- List public tours ---- */
  handleRoute('GET', '/api/community/tours', null, async () => {
    const tours = publicTours
      .filter(t => t.isPublic)
      .map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        stopCount: t.stopCount,
        playCount: t.playCount,
        creator: t.creator,
      }));
    return { status: 200, data: { tours } };
  });

  /* ---- Share a lens (auth required) ---- */
  handleRoute('POST', '/api/community/lenses/share', null, async (body, _url, reqHeaders) => {
    const user = await getSessionUser(reqHeaders);
    if (!user) return { status: 401, data: { error: 'Authentication required' } };

    const { id, name, emoji, description, color, tags } = body;
    if (!id || !name) return { status: 400, data: { error: 'Lens id and name are required' } };

    const existing = publicLenses.find(l => l.id === id);
    if (existing) {
      existing.isPublic = true;
      return { status: 200, data: { ok: true, message: 'Lens is now public' } };
    }

    publicLenses.push({
      id,
      emoji: emoji || '🔬',
      name,
      description: description || '',
      creator: user.name || 'Anonymous',
      useCount: 0,
      color: color || '#4169e1',
      tags: tags || [],
      isPublic: true,
    });

    return { status: 200, data: { ok: true, message: 'Lens shared successfully' } };
  });

  /* ---- Share a tour (auth required) ---- */
  handleRoute('POST', '/api/community/tours/share', null, async (body, _url, reqHeaders) => {
    const user = await getSessionUser(reqHeaders);
    if (!user) return { status: 401, data: { error: 'Authentication required' } };

    const { id, title, description, stopCount } = body;
    if (!id || !title) return { status: 400, data: { error: 'Tour id and title are required' } };

    const existing = publicTours.find(t => t.id === id);
    if (existing) {
      existing.isPublic = true;
      return { status: 200, data: { ok: true, message: 'Tour is now public' } };
    }

    publicTours.push({
      id,
      title,
      description: description || '',
      stopCount: stopCount || 0,
      playCount: 0,
      creator: user.name || 'Anonymous',
      isPublic: true,
    });

    return { status: 200, data: { ok: true, message: 'Tour shared successfully' } };
  });

  /* ---- Vote on an event (auth + rate limited) ---- */
  handleRoute('POST', '/api/community/vote', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('community-vote', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }

    const user = await getSessionUser(reqHeaders);
    if (!user) return { status: 401, data: { error: 'Authentication required' } };

    const { eventId, vote } = body;
    if (!eventId || (vote !== 1 && vote !== -1)) {
      return { status: 400, data: { error: 'eventId and vote (1 or -1) are required' } };
    }

    // Remove any existing vote by this user for this event
    const existingIdx = eventVotes.findIndex(v => v.eventId === eventId && v.userId === user.id);
    if (existingIdx !== -1) {
      eventVotes.splice(existingIdx, 1);
    }

    // Add the new vote
    eventVotes.push({ eventId, userId: user.id, vote });

    return { status: 200, data: { ok: true, netVotes: getNetVotes(eventId) } };
  });
}
