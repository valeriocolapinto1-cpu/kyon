import { z } from 'zod';
import { authedRoute, json, parseJson, rateLimit } from '../http';
import {
  createPrompt,
  deletePrompt,
  listProjectPrompts,
  listVersions,
  restoreVersion,
  updatePrompt,
} from '../prompts/prompts';
import {
  linkRun,
  runText,
  startRun,
  suggestionForRun,
  undoRunClose,
  updateRun,
  verifyRun,
} from '../prompts/runs';
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  promptFooter,
  setPromptFooter,
  updateTemplate,
} from '../prompts/templates';
import { previewClaudeMd, projectStatus, writeClaudeMd } from '../status';

type Id = { id: string };
type PromptId = { promptId: string };
type RunId = { runId: string };
type TemplateId = { templateId: string };

const Body = z.string().max(20_000);
const Title = z.string().trim().min(1).max(120);

/** GET /api/projects/:id/prompts → prompts + runs of the project. */
export const projectPrompts = authedRoute<Id>(async ({ db, actor }, { id }) =>
  json(await listProjectPrompts(db, actor, id)),
);

/** POST /api/projects/:id/prompts */
export const createProjectPrompt = authedRoute<Id>(async ({ request, env, db, actor }, { id }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  const body = await parseJson(
    request,
    z.object({ taskId: z.string().max(64), title: Title, body: Body }),
  );
  return json(await createPrompt(db, env, actor, id, body), { status: 201 });
});

/** PATCH /api/prompts/:promptId (a changed body becomes a new version). */
export const patchPrompt = authedRoute<PromptId>(
  async ({ request, env, db, actor }, { promptId }) => {
    await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
    const body = await parseJson(
      request,
      z.object({ title: Title, status: z.enum(['draft', 'ready', 'used']), body: Body }).partial(),
    );
    await updatePrompt(db, env, actor, promptId, body);
    return json({ ok: true });
  },
);

/** DELETE /api/prompts/:promptId */
export const removePrompt = authedRoute<PromptId>(async ({ env, db, actor }, { promptId }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  await deletePrompt(db, env, actor, promptId);
  return json({ ok: true });
});

/** GET /api/prompts/:promptId/versions */
export const versions = authedRoute<PromptId>(async ({ db, actor }, { promptId }) =>
  json({ versions: await listVersions(db, actor, promptId) }),
);

/** POST /api/prompts/:promptId/restore { versionId } */
export const restore = authedRoute<PromptId>(async ({ request, env, db, actor }, { promptId }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  const { versionId } = await parseJson(request, z.object({ versionId: z.string().max(64) }));
  await restoreVersion(db, env, actor, promptId, versionId);
  return json({ ok: true });
});

/** POST /api/prompts/:promptId/run → "Copia prompt per Claude". */
export const run = authedRoute<PromptId>(async ({ env, db, actor }, { promptId }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  return json(await startRun(db, env, actor, promptId), { status: 201 });
});

/** GET /api/runs/:runId/text → the exact copied text. */
export const text = authedRoute<RunId>(async ({ db, actor }, { runId }) =>
  json(await runText(db, actor, runId)),
);

/** PATCH /api/runs/:runId { resultNotes?, abandoned? } */
export const patchRun = authedRoute<RunId>(async ({ request, env, db, actor }, { runId }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  const body = await parseJson(
    request,
    z
      .object({ resultNotes: z.string().max(5000).nullable(), abandoned: z.literal(true) })
      .partial(),
  );
  await updateRun(db, env, actor, runId, body);
  return json({ ok: true });
});

/** POST /api/runs/:runId/verify → "Verifica stato PR". */
export const verify = authedRoute<RunId>(async ({ env, db, actor }, { runId }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  return json(await verifyRun(db, env, actor, runId));
});

/** GET /api/runs/:runId/suggestion → the most likely PR, or null. */
export const suggestion = authedRoute<RunId>(async ({ env, db, actor }, { runId }) =>
  json({ suggestion: await suggestionForRun(db, env, actor, runId) }),
);

/** POST /api/runs/:runId/link { prNumber, source } */
export const link = authedRoute<RunId>(async ({ request, env, db, actor }, { runId }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  const body = await parseJson(
    request,
    z.object({
      prNumber: z.number().int().min(1).max(10_000_000),
      source: z.enum(['manual', 'suggested']),
    }),
  );
  await linkRun(db, env, actor, runId, body.prNumber, body.source);
  return json({ ok: true });
});

/** POST /api/runs/:runId/undo-close → "Annulla chiusura". */
export const undoClose = authedRoute<RunId>(async ({ env, db, actor }, { runId }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  await undoRunClose(db, env, actor, runId);
  return json({ ok: true });
});

/** GET /api/templates?project=<id> */
export const templates = authedRoute(async ({ request, db, actor }) => {
  const projectId = new URL(request.url).searchParams.get('project');
  return json({ templates: await listTemplates(db, actor, projectId) });
});

const Scope = z.enum(['user', 'project', 'group']);

/** POST /api/templates */
export const createTemplateRoute = authedRoute(async ({ request, env, db, actor }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  const body = await parseJson(
    request,
    z.object({
      scope: Scope,
      name: z.string().trim().min(1).max(80),
      body: Body.min(1),
      projectId: z.string().max(64).nullable().default(null),
    }),
  );
  return json(await createTemplate(db, actor, body), { status: 201 });
});

/** PATCH /api/templates/:templateId */
export const patchTemplate = authedRoute<TemplateId>(
  async ({ request, env, db, actor }, { templateId }) => {
    await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
    const body = await parseJson(
      request,
      z.object({ name: z.string().trim().min(1).max(80), body: Body.min(1) }).partial(),
    );
    await updateTemplate(db, actor, templateId, body);
    return json({ ok: true });
  },
);

/** DELETE /api/templates/:templateId */
export const removeTemplate = authedRoute<TemplateId>(
  async ({ env, db, actor }, { templateId }) => {
    await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
    await deleteTemplate(db, actor, templateId);
    return json({ ok: true });
  },
);

/** GET|PUT /api/admin/prompt-footer (the automatic block's wording). */
export const footer = {
  GET: authedRoute(async ({ db }) => json(await promptFooter(db)), { admin: true }),
  PUT: authedRoute(
    async ({ request, db, actor }) => {
      const body = await parseJson(request, z.object({ footer: z.string().max(10_000) }));
      await setPromptFooter(db, actor, body.footer);
      return json(await promptFooter(db));
    },
    { admin: true },
  ),
};

/** GET /api/projects/:id/status?fresh=1 */
export const status = authedRoute<Id>(async ({ request, env, db, actor }, { id }) => {
  const fresh = new URL(request.url).searchParams.get('fresh') === '1';
  if (fresh) await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  return json(await projectStatus(db, env, actor, id, fresh));
});

/** GET /api/projects/:id/claude-md (preview) · POST (write to the repo, after confirmation). */
export const claudeMd = {
  GET: authedRoute<Id>(async ({ env, db, actor }, { id }) =>
    json(await previewClaudeMd(db, env, actor, id)),
  ),
  POST: authedRoute<Id>(async ({ env, db, actor }, { id }) => {
    await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
    await writeClaudeMd(db, env, actor, id);
    return json({ ok: true }, { status: 201 });
  }),
};
