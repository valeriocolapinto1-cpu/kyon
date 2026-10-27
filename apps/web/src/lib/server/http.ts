import type { z } from 'zod';
import { createDb, type Db } from '@/db/client';
import { readSession, type CurrentSession } from './auth';
import { getEnv } from './env';
import { ApiError, errorResponse } from './errors';

export interface RouteContext {
  request: Request;
  env: CloudflareEnv;
  db: Db;
}

export interface AuthedContext extends RouteContext {
  auth: CurrentSession;
  /** The caller as seen by can(). */
  actor: { id: string; role: 'admin' | 'user' };
}

type Params = Record<string, string | string[] | undefined>;
type NextContext = { params: Promise<Params> };

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defense in depth (cookies are already SameSite=Lax):
 * state-changing requests must come from our own origin.
 */
function assertSameOrigin(request: Request) {
  if (SAFE_METHODS.has(request.method)) return;
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new ApiError('forbidden');
}

/** Wraps a route handler: env, db, error mapping, same-origin check, write rate limit. */
export function route<P extends Params = Params>(
  handler: (ctx: RouteContext, params: P) => Promise<Response>,
) {
  return async (request: Request, context?: NextContext): Promise<Response> => {
    try {
      assertSameOrigin(request);
      const env = await getEnv();
      // Safety net for every write, whatever the route: a per-IP budget (routes add per-user
      // ones). Counters live in the Workers Rate Limiting binding: no storage writes.
      if (request.method !== 'GET' && request.method !== 'HEAD')
        await rateLimit(env.WRITE_LIMITER, `ip:${clientIp(request)}`);
      const params = ((await context?.params) ?? {}) as P;
      return await handler({ request, env, db: createDb(env.DB) }, params);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Like `route`, but requires a logged-in user (and optionally the admin role). */
export function authedRoute<P extends Params = Params>(
  handler: (ctx: AuthedContext, params: P) => Promise<Response>,
  options: { admin?: boolean } = {},
) {
  return route<P>(async (ctx, params) => {
    const auth = await readSession(ctx.env, ctx.request);
    if (!auth) throw new ApiError('unauthorized');
    if (options.admin && auth.user.role !== 'admin') throw new ApiError('forbidden');
    return handler({ ...ctx, auth, actor: { id: auth.user.id, role: auth.user.role } }, params);
  });
}

export async function parseJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError('bad_request', 'Il corpo della richiesta non è JSON valido.');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ApiError(
      'bad_request',
      issue ? `Campo non valido: ${issue.path.join('.') || 'richiesta'}.` : undefined,
    );
  }
  return result.data;
}

/** Workers rate limiting binding (no storage writes). Keys are per IP and/or user. */
export async function rateLimit(limiter: RateLimit | undefined, key: string): Promise<void> {
  if (!limiter) return;
  const { success } = await limiter.limit({ key });
  if (!success) throw new ApiError('rate_limited');
}

export function clientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local'
  );
}

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}
