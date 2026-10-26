import { z } from 'zod';
import { authorizeProject } from '../projects';
import { authedRoute, json, parseJson, rateLimit } from '../http';
import { syncProject } from '../tasks/sync';
import { listProjectTasks } from '../tasks/view';
import { add, createTasksFile, rename, setDone } from '../tasks/write';

type Id = { id: string };
type TaskParams = { id: string; taskId: string };

/** GET /api/projects/:id/tasks */
export const GET = authedRoute<Id>(async ({ db, actor }, { id }) =>
  json(await listProjectTasks(db, actor, id)),
);

const Add = z.object({
  path: z.string().min(1).max(300),
  headingPath: z.array(z.string().max(300)).max(10).nullable(),
  text: z.string().trim().min(1).max(500),
});

/** POST /api/projects/:id/tasks → adds a task to a .md file (one commit). */
export const POST = authedRoute<Id>(async ({ request, env, db, actor }, { id }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  const body = await parseJson(request, Add);
  await add(db, env, actor, id, body.path, body.headingPath, body.text);
  return json(await listProjectTasks(db, actor, id), { status: 201 });
});

const Patch = z
  .object({
    done: z.boolean(),
    text: z.string().trim().min(1).max(500),
  })
  .partial();

/** PATCH /api/projects/:id/tasks/:taskId → done and/or text (writes to the repo). */
export const patchTask = authedRoute<TaskParams>(
  async ({ request, env, db, actor }, { id, taskId }) => {
    await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
    const body = await parseJson(request, Patch);
    if (body.text !== undefined) await rename(db, env, actor, id, taskId, body.text);
    if (body.done !== undefined) await setDone(db, env, actor, id, taskId, body.done);
    return json(await listProjectTasks(db, actor, id));
  },
);

/** POST /api/projects/:id/sync → "Sincronizza ora". */
export const sync = authedRoute<Id>(async ({ env, db, actor }, { id }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  await authorizeProject(db, actor, id, 'project:view');
  const result = await syncProject(db, env, id, actor.id);
  return json({ result, ...(await listProjectTasks(db, actor, id)) });
});

/** POST /api/projects/:id/tasks-file → creates TASKS.md from the template (after confirmation). */
export const tasksFile = authedRoute<Id>(async ({ env, db, actor }, { id }) => {
  await createTasksFile(db, env, actor, id);
  return json(await listProjectTasks(db, actor, id), { status: 201 });
});
