/**
 * Authentication via Better Auth
 *
 * Lazy-initialized: only creates the auth instance when DATABASE_URL is set
 * and initAuth() is called. This prevents build-time failures.
 */

import { betterAuth } from 'better-auth';

let _auth: ReturnType<typeof betterAuth> | null = null;

export function initAuth() {
  if (_auth) return _auth;
  if (!process.env.DATABASE_URL) {
    console.log('[AUTH] No DATABASE_URL — auth disabled');
    return null;
  }

  _auth = betterAuth({
    database: {
      type: 'postgres',
      url: process.env.DATABASE_URL,
    },

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },

    socialProviders: {
      ...(process.env.GOOGLE_CLIENT_ID ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        },
      } : {}),
      ...(process.env.GITHUB_CLIENT_ID ? {
        github: {
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        },
      } : {}),
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },

    baseURL: process.env.BETTER_AUTH_URL || process.env.BASE_URL || 'http://localhost:3000',
    secret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || 'chronos-dev-secret-change-in-production',

    trustedOrigins: [
      process.env.BASE_URL || 'http://localhost:3000',
      'http://localhost:5173',
    ],
  });

  console.log('[AUTH] Better Auth initialized');
  return _auth;
}

export function getAuth() {
  return _auth;
}
