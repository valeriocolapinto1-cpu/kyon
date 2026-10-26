import { listVisibleRepos, setExposure } from '../github/repos';
import { authedRoute, json, parseJson, rateLimit } from '../http';
import { parseExposure } from './github';

export const GET = authedRoute(async ({ db, actor }) => json({ repos: await listVisibleRepos(db, actor) }));

/** PATCH /api/repos/:id → exposure (only the user who connected the repo). */
export const PATCH = authedRoute<{ id: string }>(async ({ request, env, db, actor }, { id }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  const body = await parseJson(request, parseExposure);
  const { lostAccess } = await setExposure(db, actor, id, body.exposure, body.sharedWith);
  return json({ repos: await listVisibleRepos(db, actor), lostAccess });
});
