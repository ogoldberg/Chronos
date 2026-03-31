import type { Plugin } from 'vite';
import { getProvider, getProviderConfig, setProvider } from './providers/index';
import type { AIProviderConfig } from './providers/index';
import { initDB, upsertEvents, getEventsInRange } from './db';
import { DISCOVER_SYSTEM, INSIGHTS_SYSTEM, CHAT_SYSTEM } from './prompts';

let dbReady = false;

// Server-side cache to avoid duplicate API calls for the same region
const discoveryCache = new Map<string, { events: any[]; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
const MAX_CACHE_SIZE = 1000;

function pruneCache() {
  if (discoveryCache.size <= MAX_CACHE_SIZE) return;
  const entries = [...discoveryCache.entries()]
    .sort((a, b) => a[1].timestamp - b[1].timestamp);
  const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
  for (const [key] of toRemove) discoveryCache.delete(key);
}

function parseBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: string) => (body += chunk));
    req.on('end', () => {
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

  // POST /api/config — switch provider at runtime
  if (method === 'POST' && url === '/api/config') {
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
      const events = JSON.parse(jsonMatch[0]);
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
    const { centerYear, span, visibleEvents = [] } = body;
    const resp = await ai.chat(INSIGHTS_SYSTEM, [
      { role: 'user', content: `Time period centered on year ${centerYear} (span: ${span} years). Visible events: ${visibleEvents.join(', ') || 'none'}. Give me 3 fascinating facts about this era.` },
    ], { maxTokens: 500, webSearch: true });

    const jsonMatch = resp.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return { status: 200, data: { insights: JSON.parse(jsonMatch[0]) } };
    }
    return { status: 200, data: { insights: [] } };
  }

  // POST /api/chat
  if (method === 'POST' && url === '/api/chat') {
    const { messages, context } = body;
    const system = CHAT_SYSTEM(context);
    const resp = await ai.chat(system, messages, { maxTokens: 2000, webSearch: true });
    return { status: 200, data: { content: resp.text } };
  }

  return { status: 404, data: { error: 'Not found' } };
}

/** Vite plugin — wraps handleApiRequest for dev server */
export function apiPlugin(): Plugin {
  return {
    name: 'chronos-api',
    configureServer(server) {
      // Init provider
      getProvider();

      // Init DB
      if (process.env.DATABASE_URL) {
        initDB()
          .then(() => { dbReady = true; console.log('[CHRONOS] PostgreSQL connected'); })
          .catch(err => console.log('[CHRONOS] No PostgreSQL — in-memory cache only:', err.message));
      } else {
        console.log('[CHRONOS] No DATABASE_URL — in-memory cache only');
      }

      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/api/')) return next();

        try {
          const body = req.method === 'POST' ? await parseBody(req) : {};
          const result = await handleApiRequest(req.method || 'GET', url, body);
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result.data));
        } catch (err: any) {
          console.error(`[API] ${url} error:`, err.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}
