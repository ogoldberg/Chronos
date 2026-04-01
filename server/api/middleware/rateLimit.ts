/**
 * Per-IP rate limiter with configurable limits per endpoint.
 * Falls back to global limiting if IP cannot be determined.
 */

const buckets = new Map<string, { count: number; resetAt: number }>();
const DEFAULT_LIMIT = 30; // requests per minute

const ENDPOINT_LIMITS: Record<string, number> = {
  'discover': 30,
  'chat': 20,
  'chat-stream': 20,
  'insights': 20,
  'quiz': 30,
  'myths': 20,
  'parallels': 15,
  'whatif': 15,
  'debate': 10,
  'lens': 20,
  'search': 60,
};

/**
 * Check rate limit for an endpoint.
 * @param endpoint - The endpoint name (e.g., 'discover', 'chat')
 * @param ip - Client IP address (optional, falls back to global bucket)
 */
export function checkRateLimit(endpoint: string, ip?: string): boolean {
  const limit = ENDPOINT_LIMITS[endpoint] ?? DEFAULT_LIMIT;
  const key = ip ? `${endpoint}:${ip}` : endpoint;
  const now = Date.now();

  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

/**
 * Extract client IP from request headers.
 * Handles proxies (X-Forwarded-For, X-Real-IP).
 */
export function getClientIP(headers: Record<string, string | string[] | undefined>): string {
  const forwarded = headers['x-forwarded-for'];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ip.trim();
  }
  const realIp = headers['x-real-ip'];
  if (realIp) return Array.isArray(realIp) ? realIp[0] : realIp;
  return 'unknown';
}

// Periodic cleanup of expired buckets (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now > entry.resetAt) buckets.delete(key);
  }
}, 5 * 60 * 1000);
