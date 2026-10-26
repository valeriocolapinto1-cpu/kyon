import { resetTokenEmail } from '@/lib/server/accounts';
import { ApiError } from '@/lib/server/errors';
import { clientIp, json, rateLimit, route } from '@/lib/server/http';

export const GET = route<{ token: string }>(async ({ request, env, db }, { token }) => {
  await rateLimit(env.AUTH_LIMITER, `reset:${clientIp(request)}`);
  const email = await resetTokenEmail(db, token);
  if (!email)
    throw new ApiError(
      'not_found',
      'Questo link non è valido o è scaduto. Chiedi all’admin un nuovo link.',
    );
  return json({ email });
});
