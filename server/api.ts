import type { Plugin } from 'vite';
import { getProvider, getProviderConfig, setProvider } from './providers/index';
import type { AIProviderConfig } from './providers/index';
import { initDB, upsertEvents, getEventsInRange } from './db';
import { initAuth, getAuth } from './auth';
import { toNodeHandler } from 'better-auth/node';
import { DISCOVER_SYSTEM, INSIGHTS_SYSTEM, CHAT_SYSTEM, PARALLELS_SYSTEM, MYTHS_SYSTEM, QUIZ_SYSTEM, LENS_DISCOVERY_SYSTEM } from './prompts';

let dbReady = false;

/** Set by production.ts or Vite plugin after DB init */
export function setDbReady(ready: boolean) { dbReady = ready; }

// Server-side cache to avoid duplicate API calls for the same region
const discoveryCache = new Map<string, { events: any[]; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
const MAX_CACHE_SIZE = 1000;

// Simple rate limiter: max requests per minute per endpoint
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // requests per minute

function checkRateLimit(endpoint: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(endpoint);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(endpoint, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function pruneCache() {
  if (discoveryCache.size <= MAX_CACHE_SIZE) return;
  const entries = [...discoveryCache.entries()]
    .sort((a, b) => a[1].timestamp - b[1].timestamp);
  const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
  for (const [key] of toRemove) discoveryCache.delete(key);
}

const MAX_BODY_SIZE = 1024 * 1024; // 1MB

function parseBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    let size = 0;
    let resolved = false;
    req.on('data', (chunk: string) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE && !resolved) {
        resolved = true;
        resolve({});
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (resolved) return;
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

function getEraContext(startYear: number): string {
  const absStart = Math.abs(startYear);
  if (absStart > 1e9) return 'Focus on cosmic and astrophysical events: star formation, galaxy mergers, cosmic structure. Use category "cosmic".';
  if (absStart > 1e8) return 'Focus on geological and planetary events: tectonic activity, mass extinctions, ice ages, atmospheric changes. Use category "geological".';
  if (absStart > 1e6) return 'Focus on evolutionary milestones: species emergence, migration, adaptation, extinction. Use category "evolutionary".';
  if (startYear < -3000) return 'Focus on early human history: tool development, settlement, early agriculture, cultural evolution. Use category "civilization".';
  if (startYear < 1500) return 'Focus on civilizations: empires, trade, religion, philosophy, technology, warfare, art, architecture. Use category "civilization".';
  return 'Focus on modern history: science, technology, politics, culture, social movements, exploration, industry, warfare. Use category "modern".';
}

/** Shared route handler logic — used by both Vite plugin and production server */
export async function handleApiRequest(
  method: string,
  url: string,
  body: any,
): Promise<{ status: number; data: any }> {
  const ai = getProvider();

  // GET /api/events
  if (method === 'GET' && url.startsWith('/api/events')) {
    if (!dbReady) return { status: 503, data: { error: 'Database not available' } };
    const params = new URL(url, 'http://localhost').searchParams;
    const startYear = parseFloat(params.get('start') || '-14000000000');
    const endYear = parseFloat(params.get('end') || '2030');
    const maxSpan = params.has('maxSpan') ? parseFloat(params.get('maxSpan')!) : undefined;
    const limit = parseInt(params.get('limit') || '200', 10);
    const events = await getEventsInRange(startYear, endYear, maxSpan, limit);
    return { status: 200, data: { events } };
  }

  // GET /api/config — return current provider info
  if (method === 'GET' && url === '/api/config') {
    const cfg = getProviderConfig();
    return { status: 200, data: { provider: cfg.provider, model: cfg.model, webSearch: cfg.webSearch } };
  }

  // POST /api/config — switch provider at runtime (requires ADMIN_KEY env var)
  if (method === 'POST' && url === '/api/config') {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey) {
      return { status: 403, data: { error: 'ADMIN_KEY not configured — config endpoint disabled' } };
    }
    if (body.adminKey !== adminKey) {
      return { status: 403, data: { error: 'Invalid admin key' } };
    }
    const newConfig: AIProviderConfig = {
      provider: body.provider || 'anthropic',
      model: body.model,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl,
      maxTokens: body.maxTokens,
      webSearch: body.webSearch,
    };
    setProvider(newConfig);
    return { status: 200, data: { ok: true, provider: newConfig.provider, model: newConfig.model } };
  }

  // POST /api/discover
  if (method === 'POST' && url === '/api/discover') {
    if (!checkRateLimit('discover')) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }
    const { startYear, endYear, existingTitles = [], count = 10, tierId = '' } = body;

    // Check cache
    const cacheKey = `${tierId}:${startYear}:${endYear}`;
    const cached = discoveryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return { status: 200, data: { events: cached.events, cached: true } };
    }

    const system = DISCOVER_SYSTEM(startYear, endYear, count, getEraContext(startYear), existingTitles);
    const resp = await ai.chat(system, [
      { role: 'user', content: `Generate ${count} historically important events between ${startYear} and ${endYear}. Search the web to verify key facts. Spread them evenly across the entire range.` },
    ], { maxTokens: 3000, webSearch: true });

    const jsonMatch = resp.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      let events: any[];
      try { events = JSON.parse(jsonMatch[0]); }
      catch { return { status: 200, data: { events: [] } }; }
      discoveryCache.set(cacheKey, { events, timestamp: Date.now() });
      pruneCache();

      // Persist to DB
      if (dbReady) {
        upsertEvents(events.map((e: any, i: number) => ({
          id: `d-${tierId}-${startYear}-${i}`,
          title: e.title, year: e.year, timestamp: e.timestamp || null,
          precision: e.precision || 'year', emoji: e.emoji, color: e.color,
          description: e.description, category: e.category, source: 'discovered',
          zoom_tier: tierId, wiki: e.wiki, lat: e.lat, lng: e.lng,
          geo_type: e.geoType, path: e.path, region: e.region,
        }))).catch(err => console.error('[DB] Persist error:', err.message));
      }
      return { status: 200, data: { events } };
    }
    return { status: 200, data: { events: [] } };
  }

  // POST /api/insights
  if (method === 'POST' && url === '/api/insights') {
    if (!checkRateLimit('insights')) {
      return { status: 429, data: { error: 'Rate limit exceeded' } };
    }
    const { centerYear, span, visibleEvents = [] } = body;
    const resp = await ai.chat(INSIGHTS_SYSTEM, [
      { role: 'user', content: `Time period centered on year ${centerYear} (span: ${span} years). Visible events: ${visibleEvents.join(', ') || 'none'}. Give me 3 fascinating facts about this era.` },
    ], { maxTokens: 500, webSearch: true });

    const jsonMatch = resp.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try { return { status: 200, data: { insights: JSON.parse(jsonMatch[0]) } }; }
      catch { /* fall through */ }
    }
    return { status: 200, data: { insights: [] } };
  }

  // POST /api/parallels
  if (method === 'POST' && url === '/api/parallels') {
    if (!checkRateLimit('parallels')) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }
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
  }

  // POST /api/myths
  if (method === 'POST' && url === '/api/myths') {
    if (!checkRateLimit('myths')) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }
    const { centerYear, span } = body;
    if (typeof centerYear !== 'number' || typeof span !== 'number') {
      return { status: 400, data: { error: 'centerYear and span are required numbers.' } };
    }

    const system = MYTHS_SYSTEM(centerYear, span);
    const resp = await ai.chat(system, [
      { role: 'user', content: `Generate 3 historical myths/misconceptions for the period around year ${centerYear} (span: ${span} years).` },
    ], { maxTokens: 1500, webSearch: true });

    const jsonMatch = resp.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const myths = JSON.parse(jsonMatch[0]);
        if (Array.isArray(myths)) {
          return { status: 200, data: { myths } };
        }
      } catch { /* fall through */ }
    }
    return { status: 200, data: { myths: [] } };
  }

  // POST /api/quiz
  if (method === 'POST' && url === '/api/quiz') {
    if (!checkRateLimit('quiz')) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }
    const { events = [], era = 'modern' } = body;
    if (!Array.isArray(events)) {
      return { status: 400, data: { error: 'events must be an array of strings.' } };
    }

    const system = QUIZ_SYSTEM(events.slice(0, 10), era);
    const resp = await ai.chat(system, [
      { role: 'user', content: `Generate a history quiz question about ${era} era events.` },
    ], { maxTokens: 800 });

    const jsonMatch = resp.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.question && Array.isArray(parsed.options) && parsed.options.length === 4 && typeof parsed.correctIndex === 'number') {
          return { status: 200, data: parsed };
        }
      } catch { /* fall through */ }
    }
    return { status: 500, data: { error: 'Failed to generate quiz question. Try again.' } };
  }

  // POST /api/lens/discover
  if (method === 'POST' && url === '/api/lens/discover') {
    if (!checkRateLimit('lens-discover')) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }
    const { lens, startYear, endYear, count = 8 } = body;
    if (!lens?.name || !lens?.tags || typeof startYear !== 'number' || typeof endYear !== 'number') {
      return { status: 400, data: { error: 'lens (with name, description, tags), startYear, and endYear are required.' } };
    }

    const safeCount = Math.min(Math.max(count, 1), 20);
    const system = LENS_DISCOVERY_SYSTEM(lens, startYear, endYear, safeCount);
    const resp = await ai.chat(system, [
      { role: 'user', content: `Discover ${safeCount} events between ${startYear} and ${endYear} through the "${lens.name}" lens. Focus on: ${lens.tags.slice(0, 15).join(', ')}.` },
    ], { maxTokens: 3000, webSearch: true });

    const jsonMatch = resp.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      let events: any[];
      try { events = JSON.parse(jsonMatch[0]); }
      catch { return { status: 200, data: { events: [] } }; }

      // Persist to DB
      if (dbReady) {
        upsertEvents(events.map((e: any, i: number) => ({
          id: `lens-${lens.name.replace(/\s+/g, '-').toLowerCase()}-${startYear}-${i}`,
          title: e.title, year: e.year, timestamp: e.timestamp || null,
          precision: e.precision || 'year', emoji: e.emoji, color: e.color,
          description: e.description, category: e.category, source: 'discovered',
          zoom_tier: '', wiki: e.wiki, lat: e.lat, lng: e.lng,
          geo_type: e.geoType, path: e.path, region: e.region,
        }))).catch(err => console.error('[DB] Lens persist error:', err.message));
      }
      return { status: 200, data: { events } };
    }
    return { status: 200, data: { events: [] } };
  }

  // POST /api/chat
  if (method === 'POST' && url === '/api/chat') {
    if (!checkRateLimit('chat')) {
      return { status: 429, data: { error: 'Rate limit exceeded' } };
    }
    const { messages, context } = body;
    // Validate messages
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
      return { status: 400, data: { error: 'messages must be an array of 1-20 items' } };
    }
    for (const msg of messages) {
      if (typeof msg.content !== 'string' || msg.content.length > 8000) {
        return { status: 400, data: { error: 'Each message content must be a string under 8000 chars' } };
      }
    }
    const system = CHAT_SYSTEM(context);
    const resp = await ai.chat(system, messages, { maxTokens: 2000, webSearch: true });
    return { status: 200, data: { content: resp.text } };
  }

  return { status: 404, data: { error: 'Not found' } };
}

/** Handle streaming chat via Server-Sent Events */
export async function handleStreamRequest(body: any, res: any): Promise<void> {
  if (!checkRateLimit('chat-stream')) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
    return;
  }
  const ai = getProvider();
  const { messages, context } = body;
  const system = CHAT_SYSTEM(context);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Detect client disconnect to stop generating tokens
  let aborted = false;
  res.on('close', () => { aborted = true; });

  try {
    await ai.chatStream(system, messages, (token) => {
      if (aborted) return;
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }, { maxTokens: 2000, webSearch: true });

    if (!aborted) res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err: any) {
    if (!aborted) res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }
  if (!aborted) res.end();
}

/** Vite plugin — wraps handleApiRequest for dev server */
export function apiPlugin(): Plugin {
  return {
    name: 'chronos-api',
    configureServer(server) {
      // Init provider + auth
      getProvider();
      initAuth();

      // Init DB
      if (process.env.DATABASE_URL) {
        initDB()
          .then(() => { dbReady = true; console.log('[CHRONOS] PostgreSQL connected'); })
          .catch(err => console.log('[CHRONOS] No PostgreSQL — in-memory cache only:', err.message));
      } else {
        console.log('[CHRONOS] No DATABASE_URL — in-memory cache only');
      }

      // Better Auth handler
      const authInstance = getAuth();
      if (authInstance) {
        const authHandler = toNodeHandler(authInstance);
        server.middlewares.use(async (req, res, next) => {
          if (req.url?.startsWith('/api/auth')) {
            return authHandler(req, res);
          }
          next();
        });
      }

      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/api/')) return next();

        try {
          // Streaming chat endpoint
          if (req.method === 'POST' && url === '/api/chat/stream') {
            const body = await parseBody(req);
            await handleStreamRequest(body, res);
            return;
          }

          const body = req.method === 'POST' ? await parseBody(req) : {};
          const result = await handleApiRequest(req.method || 'GET', url, body);
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result.data));
        } catch (err: any) {
          console.error(`[API] ${url} error:`, err.message, err.stack);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });
    },
  };
}
