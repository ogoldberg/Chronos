/**
 * Production server for CHRONOS
 *
 * Serves the Vite-built static assets and handles API routes.
 * Run: node --import tsx server/production.ts
 * Or after compile: node dist-server/production.js
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleApiRequest, handleStreamRequest, setDbReady } from './api';
import { getProvider } from './providers/index';
import { initDB } from './db';
import { initAuth, getAuth } from './auth';
import { toNodeHandler } from 'better-auth/node';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3000', 10);
const STATIC_DIR = path.resolve(__dirname, '..', 'dist');

async function main() {
  const app = express();

  // Init AI provider + auth
  getProvider();
  initAuth();

  // Init DB (optional)
  if (process.env.DATABASE_URL) {
    try {
      await initDB();
      setDbReady(true);
      console.log('[CHRONOS] PostgreSQL connected');
    } catch (err: any) {
      console.log('[CHRONOS] No PostgreSQL — in-memory cache only:', err.message);
    }
  } else {
    console.log('[CHRONOS] No DATABASE_URL — in-memory cache only');
  }

  // Better Auth routes — must come before body parser
  const authInstance = getAuth();
  if (authInstance) {
    app.all('/api/auth/*', toNodeHandler(authInstance));
  }

  // JSON body parser for API routes
  app.use('/api', express.json({ limit: '1mb' }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
  });

  // Streaming chat endpoint
  app.post('/api/chat/stream', async (req, res) => {
    try {
      await handleStreamRequest(req.body || {}, res);
    } catch (err: any) {
      console.error('[API] stream error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    }
  });

  // API routes
  app.all('/api/*', async (req, res) => {
    try {
      const result = await handleApiRequest(req.method, req.url, req.body || {});
      res.status(result.status).json(result.data);
    } catch (err: any) {
      console.error(`[API] ${req.url} error:`, err.message, err.stack);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Serve static assets with caching
  app.use(express.static(STATIC_DIR, {
    maxAge: '1y',
    immutable: true,
    index: false, // We handle index.html below for SPA routing
  }));

  // SPA fallback — serve index.html for all non-API, non-static routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(STATIC_DIR, 'index.html'));
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[CHRONOS] Production server running on port ${PORT}`);
    console.log(`[CHRONOS] Static assets: ${STATIC_DIR}`);
  });
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
