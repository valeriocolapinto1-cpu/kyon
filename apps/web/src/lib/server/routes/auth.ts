import { getAuth } from '@/lib/server/auth';
import { getEnv } from '@/lib/server/env';
import { ApiError, errorResponse } from '@/lib/server/errors';
import { clientIp, rateLimit } from '@/lib/server/http';

/** Endpoints that guess or set secrets: limited per IP. */
const SENSITIVE = ['/sign-in/email', '/reset-password', '/change-password'];

/** Public sign-up is closed: accounts are created only through /api/join with a valid invite. */
const BLOCKED = ['/sign-up/email'];

async function handle(request: Request): Promise<Response> {
  try {
    const env = await getEnv();
    const path = new URL(request.url).pathname.replace(/^\/api\/auth/, '');
    if (BLOCKED.some((p) => path.startsWith(p))) throw new ApiError('not_found');
    if (request.method === 'POST' && SENSITIVE.some((p) => path.startsWith(p))) {
      await rateLimit(env.AUTH_LIMITER, `auth:${clientIp(request)}`);
    }
    return await getAuth(env, new URL(request.url).origin).handler(request);
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = handle;
export const POST = handle;
