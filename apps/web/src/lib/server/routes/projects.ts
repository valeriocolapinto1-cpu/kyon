import { z } from 'zod';
import { createProject, listMyProjects } from '../projects';
import { authedRoute, json, parseJson, rateLimit } from '../http';

export const GET = authedRoute(async ({ db, actor }) => json({ projects: await listMyProjects(db, actor) }));

const Create = z.object({ repoId: z.string().min(1).max(64), name: z.string().trim().min(1).max(80) });

export const POST = authedRoute(async ({ request, env, db, actor }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  const body = await parseJson(request, Create);
  const id = await createProject(db, actor, body.repoId, body.name);
  return json({ id }, { status: 201 });
});
