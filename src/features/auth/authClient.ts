/**
 * Better Auth client for CHRONOS
 *
 * Provides sign-up, sign-in, sign-out, and session management.
 * Works with both email/password and social OAuth providers.
 */

import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: window.location.origin,
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
} = authClient;
