/**
 * Router composition — registers all API routes and exports
 * handleApiRequest / handleStreamRequest / apiPlugin for use by
 * both the Vite dev server and the production Express server.
 */

import type { Plugin } from 'vite';
import { getProvider } from '../providers/index';
import { initDB } from '../db';
import { initAuth, getAuth } from '../auth';
import { toNodeHandler } from 'better-auth/node';

import { registerEventsRoutes } from './routes/events';
import { registerDiscoverRoutes } from './routes/discover';
import { registerChatRoutes, handleStreamRequest } from './routes/chat';
import { registerInsightsRoutes } from './routes/insights';
import { registerParallelsRoutes } from './routes/parallels';
import { registerMythsRoutes } from './routes/myths';
import { registerQuizRoutes } from './routes/quiz';
import { registerLensRoutes } from './routes/lens';
import { registerWhatifRoutes } from './routes/whatif';
import { registerDebateRoutes } from './routes/debate';
import { registerUserRoutes } from './routes/user';
import { registerConfigRoutes } from './routes/config';
import { registerCommunityRoutes } from './routes/community';
import { registerCurriculumRoutes } from './routes/curriculum';
import { registerComparisonRoutes } from './routes/comparison';
import { registerModerationRoutes } from './routes/moderation';

export { handleStreamRequest };

// ── Types ────────────────────────────────────────────────────────────

export type ApiResult = { status: number; data: any };

type HandlerFn = (
  body: any,
  url: string,
  reqHeaders?: Record<string, string | string[] | undefined>,
) => Promise<ApiResult>;

export type RouteHandler = (
  method: string,
  pattern: string,
  _schema: unknown, // reserved for future middleware use
  handler: HandlerFn,
) => void;

// ── State ────────────────────────────────────────────────────────────

let dbReady = false;

export function setDbReady(ready: boolean) { dbReady = ready; }

// ── Route table ──────────────────────────────────────────────────────

interface Route {
  method: string;
  pattern: string;
  handler: HandlerFn;
}

const routes: Route[] = [];

const handleRoute: RouteHandler = (method, pattern, _schema, handler) => {
  routes.push({ method, pattern, handler });
};

// Helper: check if DB is ready (passed as closure to route modules)
const isDbReady = () => dbReady;

// Register all routes
registerEventsRoutes(handleRoute, isDbReady);
registerDiscoverRoutes(handleRoute, isDbReady);
registerChatRoutes(handleRoute);
registerInsightsRoutes(handleRoute);
registerParallelsRoutes(handleRoute);
registerMythsRoutes(handleRoute);
registerQuizRoutes(handleRoute);
registerLensRoutes(handleRoute, isDbReady);
registerWhatifRoutes(handleRoute);
registerDebateRoutes(handleRoute);
registerUserRoutes(handleRoute, isDbReady);
registerConfigRoutes(handleRoute);
registerCommunityRoutes(handleRoute);
registerCurriculumRoutes(handleRoute, isDbReady);
registerComparisonRoutes(handleRoute);
registerModerationRoutes(handleRoute, isDbReady);

// ── Request dispatcher ───────────────────────────────────────────────

function matchRoute(method: string, url: string): Route | undefined {
  const path = url.split('?')[0];
  for (const route of routes) {
    if (route.method !== method) continue;
    // Exact path match, or path matches with query string appended
    if (path === route.pattern) return route;
    if (url.startsWith(route.pattern + '?')) return route;
  }
  return undefined;
}

export async function handleApiRequest(
  method: string,
  url: string,
  body: any,
  reqHeaders?: Record<string, string | string[] | undefined>,
): Promise<ApiResult> {
  const route = matchRoute(method, url);
  if (route) {
    return route.handler(body, url, reqHeaders);
  }
  return { status: 404, data: { error: 'Not found' } };
}

// ── Body parser (for Vite dev server) ────────────────────────────────

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

// ── Vite plugin ──────────────────────────────────────────────────────

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
          const result = await handleApiRequest(req.method || 'GET', url, body, req.headers as Record<string, string | string[] | undefined>);
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
