import { and, eq, or } from 'drizzle-orm';
import { BUILTIN_TEMPLATES, DEFAULT_FOOTER, can, type Actor } from '@kyon/core';
import type { Db } from '@/db/client';
import { appMeta, promptTemplate } from '@/db/schema';
import { ApiError } from '../errors';
import { authorizeProject, projectResource } from '../projects';

export type TemplateScope = 'builtin' | 'group' | 'user' | 'project';

export interface TemplateView {
  id: string;
  scope: TemplateScope;
  name: string;
  body: string;
  projectId: string | null;
  editable: boolean;
}

/** Built-in templates first, then the group's, the project's and the actor's own. */
export async function listTemplates(
  db: Db,
  actor: Actor,
  projectId: string | null,
): Promise<TemplateView[]> {
  const access = projectId ? await authorizeProject(db, actor, projectId, 'project:view') : null;
  const rows = await db
    .select()
    .from(promptTemplate)
    .where(
      or(
        eq(promptTemplate.scope, 'group'),
        and(eq(promptTemplate.scope, 'user'), eq(promptTemplate.ownerId, actor.id)),
        ...(projectId
          ? [and(eq(promptTemplate.scope, 'project'), eq(promptTemplate.projectId, projectId))]
          : []),
      ),
    )
    .orderBy(promptTemplate.name);
  const canProject = access
    ? can(actor, 'project:write_prompt', projectResource(access.project, access.role))
    : false;
  const isAdmin = can(actor, 'admin:prompts', { kind: 'group' });
  const order: Record<string, number> = { group: 1, project: 2, user: 3 };
  return [
    ...BUILTIN_TEMPLATES.map((t) => ({
      id: `builtin:${t.key}`,
      scope: 'builtin' as const,
      name: t.name,
      body: t.body,
      projectId: null,
      editable: false,
    })),
    ...rows
      .sort((a, b) => (order[a.scope] ?? 9) - (order[b.scope] ?? 9))
      .map((t) => ({
        id: t.id,
        scope: t.scope as TemplateScope,
        name: t.name,
        body: t.body,
        projectId: t.projectId,
        editable:
          t.scope === 'user' ? t.ownerId === actor.id : t.scope === 'group' ? isAdmin : canProject,
      })),
  ];
}

async function authorizeScope(
  db: Db,
  actor: Actor,
  scope: Exclude<TemplateScope, 'builtin'>,
  projectId: string | null,
) {
  if (scope === 'group' && !can(actor, 'admin:prompts', { kind: 'group' }))
    throw new ApiError('forbidden', 'Solo l’admin può gestire i template del gruppo.');
  if (scope === 'project') {
    if (!projectId) throw new ApiError('bad_request');
    await authorizeProject(db, actor, projectId, 'project:write_prompt');
  }
}

export async function createTemplate(
  db: Db,
  actor: Actor,
  input: {
    scope: Exclude<TemplateScope, 'builtin'>;
    name: string;
    body: string;
    projectId: string | null;
  },
) {
  await authorizeScope(db, actor, input.scope, input.projectId);
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(promptTemplate).values({
    id,
    scope: input.scope,
    ownerId: input.scope === 'user' ? actor.id : null,
    projectId: input.scope === 'project' ? input.projectId : null,
    name: input.name,
    body: input.body,
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
  });
  return { id };
}

async function loadEditable(db: Db, actor: Actor, templateId: string) {
  const [row] = await db
    .select()
    .from(promptTemplate)
    .where(eq(promptTemplate.id, templateId))
    .limit(1);
  if (!row) throw new ApiError('not_found');
  if (row.scope === 'user' && row.ownerId !== actor.id) throw new ApiError('not_found');
  await authorizeScope(db, actor, row.scope as 'group' | 'user' | 'project', row.projectId);
  return row;
}

export async function updateTemplate(
  db: Db,
  actor: Actor,
  templateId: string,
  patch: { name?: string; body?: string },
) {
  await loadEditable(db, actor, templateId);
  await db
    .update(promptTemplate)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(promptTemplate.id, templateId));
}

export async function deleteTemplate(db: Db, actor: Actor, templateId: string) {
  await loadEditable(db, actor, templateId);
  await db.delete(promptTemplate).where(eq(promptTemplate.id, templateId));
}

const FOOTER_KEY = 'prompt_footer';

/** The automatic block's wording (admin setting), or the default one. */
export async function promptFooter(db: Db): Promise<{ footer: string; custom: boolean }> {
  const [row] = await db.select().from(appMeta).where(eq(appMeta.key, FOOTER_KEY)).limit(1);
  return row?.value
    ? { footer: row.value, custom: true }
    : { footer: DEFAULT_FOOTER, custom: false };
}

/** An empty value goes back to the default. The `Kyon-Run:` line is added anyway when missing. */
export async function setPromptFooter(db: Db, actor: Actor, footer: string) {
  if (!can(actor, 'admin:prompts', { kind: 'group' })) throw new ApiError('forbidden');
  if (!footer.trim()) {
    await db.delete(appMeta).where(eq(appMeta.key, FOOTER_KEY));
    return;
  }
  const now = new Date();
  await db
    .insert(appMeta)
    .values({ key: FOOTER_KEY, value: footer, updatedAt: now })
    .onConflictDoUpdate({ target: appMeta.key, set: { value: footer, updatedAt: now } });
}
