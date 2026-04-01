/**
 * Simple in-memory rate limiter: max requests per minute per endpoint.
 */

const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // requests per minute

export function checkRateLimit(endpoint: string): boolean {
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
