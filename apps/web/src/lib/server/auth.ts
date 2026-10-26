import type { BetterAuthPlugin } from 'better-auth';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthEndpoint, sessionMiddleware } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import {
  CLIENT_KEY_LENGTH,
  SESSION_EXPIRES_IN_S,
  SESSION_UPDATE_AGE_S,
  hashClientKey,
  shouldRotateSession,
  verifyClientKey,
} from '@kyon/core';
import { createDb } from '@/db/client';
import * as schema from '@/db/schema';

/**
 * Weekly session token rotation (sessions otherwise last until logout).
 * The client calls POST /api/auth/rotate-session once per app start.
 */
const sessionRotation = {
  id: 'kyon-session-rotation',
  endpoints: {
    rotateSession: createAuthEndpoint(
      '/rotate-session',
      { method: 'POST', use: [sessionMiddleware] },
      async (ctx) => {
        const { session, user } = ctx.context.session;
        if (!shouldRotateSession(new Date(session.createdAt), new Date())) {
          return ctx.json({ rotated: false });
        }
        const fresh = await ctx.context.internalAdapter.createSession(user.id, false, {
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
        });
        if (!fresh) throw new APIError('INTERNAL_SERVER_ERROR');
        await setSessionCookie(ctx, { session: fresh, user });
        await ctx.context.internalAdapter.deleteSession(session.token);
        return ctx.json({ rotated: true });
      },
    ),
  },
} satisfies BetterAuthPlugin;

function buildAuth(env: CloudflareEnv, baseURL: string) {
  return betterAuth({
    appName: 'Kyon',
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(createDb(env.DB), { provider: 'sqlite', schema }),
    telemetry: { enabled: false },
    emailAndPassword: {
      enabled: true,
      // The browser sends a derived key, never the password (see @kyon/core auth/password.ts).
      minPasswordLength: CLIENT_KEY_LENGTH,
      maxPasswordLength: CLIENT_KEY_LENGTH,
      autoSignIn: true,
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: (key) => hashClientKey(key),
        verify: ({ hash, password }) => verifyClientKey(hash, password),
      },
    },
    user: {
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'user', input: false },
      },
      changeEmail: { enabled: false },
    },
    session: {
      expiresIn: SESSION_EXPIRES_IN_S,
      updateAge: SESSION_UPDATE_AGE_S,
      // No cookie cache: every request checks D1, so revocations and role changes apply at once.
      cookieCache: { enabled: false },
    },
    // Rate limiting happens in front of the handler with the Workers rate limiting binding.
    rateLimit: { enabled: false },
    advanced: {
      useSecureCookies: baseURL.startsWith('https://'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
    plugins: [sessionRotation],
  });
}

export type Auth = ReturnType<typeof buildAuth>;

const cache = new WeakMap<CloudflareEnv, Map<string, Auth>>();

/** One Better Auth instance per isolate and origin (building it per request would waste CPU). */
export function getAuth(env: CloudflareEnv, baseURL: string): Auth {
  let byOrigin = cache.get(env);
  if (!byOrigin) {
    byOrigin = new Map();
    cache.set(env, byOrigin);
  }
  let auth = byOrigin.get(baseURL);
  if (!auth) {
    auth = buildAuth(env, baseURL);
    byOrigin.set(baseURL, auth);
  }
  return auth;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

export interface CurrentSession {
  user: SessionUser;
  session: { id: string; token: string; createdAt: Date };
}

/** Reads the session from the request cookies. Returns null when logged out. */
export async function readSession(
  env: CloudflareEnv,
  request: Request,
): Promise<CurrentSession | null> {
  const auth = getAuth(env, new URL(request.url).origin);
  const result = await auth.api.getSession({ headers: request.headers });
  if (!result) return null;
  const role = (result.user as { role?: string }).role === 'admin' ? 'admin' : 'user';
  return {
    user: { id: result.user.id, name: result.user.name, email: result.user.email, role },
    session: {
      id: result.session.id,
      token: result.session.token,
      createdAt: new Date(result.session.createdAt),
    },
  };
}
