import { z } from 'zod';
import { ACCENT_IDS, PRIORITIES, isDay } from '@kyon/core';
import { authorizeProject } from '../projects';
import { authedRoute, json, parseJson, rateLimit } from '../http';
import { publishTasks } from '../realtime';
import {
  createColumn,
  createLabel,
  deleteColumn,
  deleteLabel,
  updateColumn,
  updateLabel,
} from '../tasks/board';
import { taskHistory, updateTaskMeta } from '../tasks/meta';
import { syncProject } from '../tasks/sync';
import { listProjectTasks } from '../tasks/view';
import { add, createTasksFile, rename, setDone } from '../tasks/write';

type Id = { id: string };
type TaskParams = { id: string; taskId: string };
type ColumnParams = { id: string; columnId: string };
type LabelParams = { id: string; labelId: string };

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
  await publishTasks(env, id, actor.id);
  return json(await listProjectTasks(db, actor, id), { status: 201 });
});

const day = z.string().refine(isDay, 'Data non valida');

const Patch = z
  .object({
    /** Repo writes. */
    done: z.boolean(),
    text: z.string().trim().min(1).max(500),
    /** Kyon metadata. */
    assigneeId: z.string().max(64).nullable(),
    priority: z.enum(PRIORITIES),
    dueDate: day.nullable(),
    notes: z.string().max(5000).nullable(),
    labelIds: z.array(z.string().max(64)).max(10),
    move: z.object({ columnId: z.string().max(64), index: z.number().int().min(0).max(10_000) }),
  })
  .partial();

/** PATCH /api/projects/:id/tasks/:taskId */
export const patchTask = authedRoute<TaskParams>(
  async ({ request, env, db, actor }, { id, taskId }) => {
    await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
    const { done, text, ...meta } = await parseJson(request, Patch);
    if (text !== undefined) await rename(db, env, actor, id, taskId, text);
    if (done !== undefined) await setDone(db, env, actor, id, taskId, done);
    if (Object.keys(meta).length) await updateTaskMeta(db, env, actor, id, taskId, meta);
    else if (text !== undefined || done !== undefined) await publishTasks(env, id, actor.id);
    return json(await listProjectTasks(db, actor, id));
  },
);

/** GET /api/projects/:id/tasks/:taskId/history */
export const history = authedRoute<TaskParams>(async ({ db, actor }, { id, taskId }) =>
  json(await taskHistory(db, actor, id, taskId)),
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
  await publishTasks(env, id, actor.id);
  return json(await listProjectTasks(db, actor, id), { status: 201 });
});

const ColumnName = z.string().trim().min(1).max(40);

/** POST /api/projects/:id/columns */
export const columns = authedRoute<Id>(async ({ request, env, db, actor }, { id }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  const body = await parseJson(request, z.object({ name: ColumnName }));
  await createColumn(db, env, actor, id, body.name);
  return json(await listProjectTasks(db, actor, id), { status: 201 });
});

const ColumnPatch = z
  .object({ name: ColumnName, index: z.number().int().min(0).max(20) })
  .partial()
  .refine((v) => v.name !== undefined || v.index !== undefined);

/** PATCH /api/projects/:id/columns/:columnId */
export const patchColumn = authedRoute<ColumnParams>(
  async ({ request, env, db, actor }, { id, columnId }) => {
    await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
    await updateColumn(db, env, actor, id, columnId, await parseJson(request, ColumnPatch));
    return json(await listProjectTasks(db, actor, id));
  },
);

/** DELETE /api/projects/:id/columns/:columnId */
export const removeColumn = authedRoute<ColumnParams>(
  async ({ env, db, actor }, { id, columnId }) => {
    await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
    await deleteColumn(db, env, actor, id, columnId);
    return json(await listProjectTasks(db, actor, id));
  },
);

const Label = z.object({
  name: z.string().trim().min(1).max(30),
  color: z.enum(ACCENT_IDS as [string, ...string[]]),
});

/** POST /api/projects/:id/labels → { id } (an existing label with the same name is reused). */
export const labels = authedRoute<Id>(async ({ request, env, db, actor }, { id }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  return json(await createLabel(db, env, actor, id, await parseJson(request, Label)), {
    status: 201,
  });
});

/** PATCH /api/projects/:id/labels/:labelId */
export const patchLabel = authedRoute<LabelParams>(
  async ({ request, env, db, actor }, { id, labelId }) => {
    await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
    const body = await parseJson(
      request,
      Label.partial().refine((v) => v.name !== undefined || v.color !== undefined),
    );
    await updateLabel(db, env, actor, id, labelId, body);
    return json(await listProjectTasks(db, actor, id));
  },
);

/** DELETE /api/projects/:id/labels/:labelId */
export const removeLabel = authedRoute<LabelParams>(async ({ env, db, actor }, { id, labelId }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  await deleteLabel(db, env, actor, id, labelId);
  return json(await listProjectTasks(db, actor, id));
});
