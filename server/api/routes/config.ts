/**
 * GET /api/config — return current provider info
 * POST /api/config — switch provider at runtime
 */

import { getProviderConfig, setProvider } from '../../providers/index';
import type { AIProviderConfig } from '../../providers/index';
import type { RouteHandler } from '../index';

export function registerConfigRoutes(handleRoute: RouteHandler) {
  handleRoute('GET', '/api/config', null, async () => {
    const cfg = getProviderConfig();
    return { status: 200, data: { provider: cfg.provider, model: cfg.model, webSearch: cfg.webSearch } };
  });

  handleRoute('POST', '/api/config', null, async (body) => {
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
  });
}
