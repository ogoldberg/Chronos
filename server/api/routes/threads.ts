/**
 * POST /api/threads/propose — user-proposed convergence validation
 *
 * The user types a natural-language hypothesis about how two historical
 * threads connect ("the printing press caused the Reformation", "jazz and
 * the civil rights movement are entangled"). The AI plays historian,
 * validates the claim, and returns zero or more structured "threads" the
 * timeline can draw as arcs between the events involved.
 *
 * Each returned thread names a source and target event (by title), a
 * relationship type, a short label to paint on the arc, a 1–2 sentence
 * explanation, and a confidence level. The client stores accepted threads
 * in `proposedThreads` state and the renderer draws them as a distinct
 * style from system-detected convergences so the user always knows which
 * threads came from their own hypothesis.
 *
 * No DB persistence: proposed threads live only in the client session.
 * This keeps the feature cheap to iterate on and avoids having to moderate
 * user-authored content at the database layer.
 */

import { z } from 'zod';
import { getProviderForRequest } from '../../providers/index';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import type { RouteHandler } from '../index';

const proposeSchema = z.object({
  hypothesis: z.string().min(3).max(800),
  // Titles the client currently has on screen, so the AI can ground its
  // answer in events we already know how to draw. The client trims this
  // list aggressively to keep the prompt compact.
  visibleEventTitles: z.array(z.string()).max(80).default([]),
  startYear: z.number().optional(),
  endYear: z.number().optional(),
});

function systemPrompt(visibleTitles: string[], startYear?: number, endYear?: number): string {
  const windowLine = startYear != null && endYear != null
    ? `Current viewport: ${startYear} to ${endYear}.`
    : '';
  const catalog = visibleTitles.length > 0
    ? `Events currently visible on the user's timeline (prefer referencing these by exact title):\n${visibleTitles.slice(0, 60).map(t => `- ${t}`).join('\n')}`
    : 'No event catalog provided — reference well-known historical events by their commonly-used name.';

  return `You are a rigorous historian helping a user extend an interactive timeline. The user will propose a connection between historical events or themes — sometimes lucid, sometimes speculative, sometimes wrong.

Your job is to:
1. Judge whether the proposed connection is historically valid.
2. Break it into one or more concrete, directed threads between specific historical events.
3. For each valid thread, return the source event, target event, the relationship type, a short visual label, and a 1–2 sentence rationale the user can read.
4. Ignore claims that are pseudohistorical, anachronistic, or unsupportable.

${windowLine}

${catalog}

Return ONLY a JSON object with this exact shape (no prose, no markdown fences):
{
  "summary": "One sentence about your overall judgment of the user's hypothesis.",
  "threads": [
    {
      "fromTitle": "Exact event title (prefer from the visible list)",
      "toTitle": "Exact event title",
      "fromYear": 1439,
      "toYear": 1517,
      "relationship": "caused" | "influenced" | "preceded" | "enabled" | "responded_to" | "related",
      "label": "short verb phrase, 1-4 words",
      "explanation": "1–2 sentence historical rationale.",
      "confidence": "high" | "medium" | "low",
      "valid": true
    }
  ]
}

Rules:
- If the user's hypothesis is invalid, return "threads": [] and explain why in "summary".
- Never invent fake events. If the user references something real but you don't recognize the exact spelling, use the canonical title.
- "valid": false entries ARE allowed if you want to flag a single leg of a multi-step claim that doesn't hold up — the client will show them to the user as rejected.
- Prefer high-confidence threads backed by mainstream historical consensus. Mark speculative-but-defensible claims as "medium", and genuinely fringe connections as "low".
- Keep "label" tight — it's painted on an arc in the UI: e.g. "enabled", "sparked", "echoed", "answered".
- Return at most 6 threads.`;
}

export function registerThreadsRoutes(handleRoute: RouteHandler) {
  handleRoute('POST', '/api/threads/propose', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('threads-propose', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }
    const parsed = validate(proposeSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };
    const { hypothesis, visibleEventTitles, startYear, endYear } = parsed.data;

    const ai = getProviderForRequest(reqHeaders);
    const system = systemPrompt(visibleEventTitles, startYear, endYear);
    const resp = await ai.chat(
      system,
      [{ role: 'user', content: hypothesis }],
      { maxTokens: 2000, webSearch: true },
    );

    // Expect JSON object — peel off any accidental preamble.
    const jsonMatch = resp.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { status: 200, data: { summary: 'I couldn\'t formalize that into threads.', threads: [] } };
    }

    let out: unknown;
    try { out = JSON.parse(jsonMatch[0]); }
    catch {
      return { status: 200, data: { summary: 'I couldn\'t parse the response — try rephrasing.', threads: [] } };
    }

    const obj = (out && typeof out === 'object') ? out as Record<string, unknown> : {};
    const rawThreads = Array.isArray(obj.threads) ? obj.threads : [];
    const threads = rawThreads
      .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
      .map(t => ({
        fromTitle: typeof t.fromTitle === 'string' ? t.fromTitle : '',
        toTitle: typeof t.toTitle === 'string' ? t.toTitle : '',
        fromYear: typeof t.fromYear === 'number' ? t.fromYear : undefined,
        toYear: typeof t.toYear === 'number' ? t.toYear : undefined,
        relationship: typeof t.relationship === 'string' ? t.relationship : 'related',
        label: typeof t.label === 'string' ? t.label : '',
        explanation: typeof t.explanation === 'string' ? t.explanation : '',
        confidence: (t.confidence === 'high' || t.confidence === 'medium' || t.confidence === 'low') ? t.confidence : 'medium',
        valid: t.valid !== false, // default to true
      }))
      .filter(t => t.fromTitle && t.toTitle);

    const summary = typeof obj.summary === 'string' ? obj.summary : '';
    return { status: 200, data: { summary, threads } };
  });
}
