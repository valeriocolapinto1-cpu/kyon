import { z } from 'zod';
import {
  addMember,
  deleteProject,
  getProjectDetail,
  leaveProject,
  removeMember,
  setArchived,
  setMemberRole,
  transferOwnership,
  updateProjectSettings,
} from '../projects';
import { authedRoute, json, parseJson, rateLimit } from '../http';

type Id = { id: string };
type Member = { id: string; userId: string };

export const GET = authedRoute<Id>(async ({ db, actor }, { id }) =>
  json(await getProjectDetail(db, actor, id)),
);

const Settings = z
  .object({
    name: z.string().trim().min(1).max(80),
    commitMode: z.enum(['direct', 'branch_pr']),
    workBranch: z
      .string()
      .trim()
      .max(100)
      .regex(/^[\w./-]*$/)
      .nullable(),
    viewersCanComment: z.boolean(),
    planHeadings: z.array(z.string().trim().min(1).max(40)).max(30),
    ignoreGlobs: z.array(z.string().trim().min(1).max(120)).max(30),
    showArchive: z.boolean(),
    checklistFiles: z.array(z.string().min(1).max(300)).max(500),
  })
  .partial();

export const PATCH = authedRoute<Id>(async ({ request, env, db, actor }, { id }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  await updateProjectSettings(db, actor, id, await parseJson(request, Settings));
  return json(await getProjectDetail(db, actor, id));
});

const Delete = z.object({ confirmName: z.string().max(80) });

export const DELETE = authedRoute<Id>(async ({ request, db, actor }, { id }) => {
  const { confirmName } = await parseJson(request, Delete);
  await deleteProject(db, actor, id, confirmName);
  return json({ ok: true });
});

const AddMember = z.object({
  userId: z.string().min(1).max(64),
  role: z.enum(['member', 'viewer']).default('member'),
});

export const addMemberRoute = authedRoute<Id>(async ({ request, db, actor }, { id }) => {
  const body = await parseJson(request, AddMember);
  await addMember(db, actor, id, body.userId, body.role);
  return json(await getProjectDetail(db, actor, id));
});

const Role = z.object({ role: z.enum(['member', 'viewer']) });

export const memberRoleRoute = authedRoute<Member>(
  async ({ request, db, actor }, { id, userId }) => {
    const { role } = await parseJson(request, Role);
    await setMemberRole(db, actor, id, userId, role);
    return json(await getProjectDetail(db, actor, id));
  },
);

export const removeMemberRoute = authedRoute<Member>(async ({ db, actor }, { id, userId }) => {
  await removeMember(db, actor, id, userId);
  return json(await getProjectDetail(db, actor, id));
});

export const leaveRoute = authedRoute<Id>(async ({ db, actor }, { id }) => {
  await leaveProject(db, actor, id);
  return json({ ok: true });
});

const Transfer = z.object({ userId: z.string().min(1).max(64) });

export const transferRoute = authedRoute<Id>(async ({ request, db, actor }, { id }) => {
  const { userId } = await parseJson(request, Transfer);
  await transferOwnership(db, actor, id, userId);
  return json(await getProjectDetail(db, actor, id));
});

const Archive = z.object({ archived: z.boolean() });

export const archiveRoute = authedRoute<Id>(async ({ request, db, actor }, { id }) => {
  const { archived } = await parseJson(request, Archive);
  await setArchived(db, actor, id, archived);
  return json(await getProjectDetail(db, actor, id));
});
