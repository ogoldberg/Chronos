/**
 * Root-level auth config solely for the Better Auth CLI. The CLI loads
 * this file, reads the default-exported instance, and generates the
 * correct schema for the Better Auth version we're pinned to. Our
 * runtime still uses `server/auth.ts`'s lazy `initAuth()` — this file
 * exists only so `npx @better-auth/cli migrate` has something to read.
 */
import 'dotenv/config';
import { betterAuth } from 'better-auth';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/chronos',
});

export const auth = betterAuth({
  database: pool,
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  secret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || 'chronos-dev-only-not-for-production',
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:5173',
});

export default auth;
