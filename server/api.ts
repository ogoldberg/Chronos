/**
 * Legacy re-export — all API logic has moved to server/api/index.ts
 *
 * This file exists solely to avoid breaking existing imports in
 * production.ts and vite.config.ts during the transition.
 */

export {
  handleApiRequest,
  handleStreamRequest,
  setDbReady,
  apiPlugin,
} from './api/index';
