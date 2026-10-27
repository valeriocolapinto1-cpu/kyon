import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { Actor } from '@kyon/core';
import type { Db } from '@/db/client';
import {
  activityEvent,
  appMeta,
  attachment,
  chatMessage,
  chatRoom,
  githubConnection,
  githubRepo,
  kanbanColumn,
  notification,
  project,
  projectMember,
  projectSync,
  prompt,
  promptRun,
  promptVersion,
  pushSubscription,
  taskMeta,
  user,
} from '@/db/schema';
import { inChunks } from './d1';
import { emailProvider } from './notifications/email';
import { memberProjects } from './home';

export const WEBHOOK_KEY = 'webhook:last';
const CRON_KEY = 'cron:last_run';

/** Remembers the last valid webhook delivery (one tiny write per delivery). */
export async function recordWebhook(db: Db, event: string) {
  const now = new Date();
  await db
    .insert(appMeta)
    .values({ key: WEBHOOK_KEY, value: event, updatedAt: now })
    .onConflictDoUpdate({ target: appMeta.key, set: { value: event, updatedAt: now } });
}

/**
 * The admin "Salute" page: webhooks, cron, sync per project, errors, how much is stored.
 * Names of other people's repos appear only for projects the admin is a member of.
 */
export async function healthReport(db: Db, env: CloudflareEnv, actor: Actor) {
  const [meta, syncs, connections, totals, pushFailing, dbSize] = await Promise.all([
    db
      .select()
      .from(appMeta)
      .where(inArray(appMeta.key, [WEBHOOK_KEY, CRON_KEY])),
    db
      .select({
        projectId: projectSync.projectId,
        name: project.name,
        lastSyncAt: projectSync.lastSyncAt,
        lastError: projectSync.lastError,
        pending: projectSync.pending,
        archivedAt: project.archivedAt,
      })
      .from(projectSync)
      .innerJoin(project, eq(project.id, projectSync.projectId)),
    db
      .select({
        name: user.name,
        login: githubConnection.login,
        lastSyncAt: githubConnection.lastSyncAt,
        lastError: githubConnection.lastError,
      })
      .from(githubConnection)
      .innerJoin(user, eq(user.id, githubConnection.userId)),
    db
      .select({
        users: sql<number>`(select count(*) from ${user})`,
        projects: sql<number>`(select count(*) from ${project})`,
        tasks: sql<number>`(select count(*) from ${taskMeta} where ${taskMeta.orphanedAt} is null)`,
        messages: sql<number>`(select count(*) from ${chatMessage})`,
        attachments: sql<number>`(select count(*) from ${attachment})`,
        attachmentBytes: sql<number>`(select coalesce(sum(${attachment.size}), 0) from ${attachment})`,
        notifications: sql<number>`(select count(*) from ${notification})`,
        pushDevices: sql<number>`(select count(*) from ${pushSubscription})`,
        events: sql<number>`(select count(*) from ${activityEvent})`,
      })
      .from(sql`(select 1)`),
    db
      .select({ value: sql<number>`count(*)` })
      .from(pushSubscription)
      .where(gt(pushSubscription.failures, 0)),
    // D1 reports the database size with every query (pragmas are not allowed there).
    env.DB.prepare('select 1')
      .run()
      .then((r) => ({ size: Number((r.meta as { size_after?: number }).size_after ?? NaN) }))
      .catch((error: unknown) => {
        console.warn('DB size unavailable', error);
        return null;
      }),
  ]);
  const visible = new Set((await memberProjects(db, actor.id)).map((p) => p.id));
  const at = (key: string) => meta.find((m) => m.key === key);
  const pendingCount = (value: string | null) => {
    try {
      return value ? (JSON.parse(value) as unknown[]).length : 0;
    } catch (error) {
      console.warn('Invalid pending list', error);
      return 0;
    }
  };
  const t = totals[0];
  return {
    checkedAt: new Date().toISOString(),
    config: {
      githubApp: Boolean(env.GITHUB_APP_CLIENT_ID && env.GITHUB_WEBHOOK_SECRET),
      email: emailProvider(env).available,
      push: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
      siteUrl: env.KYON_URL ?? null,
    },
    webhook: at(WEBHOOK_KEY)
      ? { event: at(WEBHOOK_KEY)?.value, at: at(WEBHOOK_KEY)?.updatedAt.toISOString() }
      : null,
    cron: at(CRON_KEY) ? { at: at(CRON_KEY)?.value } : null,
    projects: syncs.map((s) => ({
      // Projects the admin isn't in stay anonymous: their existence is counted, not named.
      name: visible.has(s.projectId) ? s.name : null,
      archived: s.archivedAt !== null,
      lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
      lastError: visible.has(s.projectId) ? s.lastError : s.lastError ? 'errore' : null,
      pending: pendingCount(s.pending),
    })),
    github: connections.map((c) => ({
      name: c.name,
      login: c.login,
      lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
      lastError: c.lastError,
    })),
    pushFailing: Number(pushFailing[0]?.value ?? 0),
    totals: t ? Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Number(v)])) : {},
    databaseBytes: dbSize && Number.isFinite(dbSize.size) ? dbSize.size : null,
  };
}

// ---------- Export ----------

/**
 * Everything the admin can see, as data: projects they're in (members, columns, task
 * metadata, prompts with every version, runs, discussions) and the group chat. Others'
 * projects are not exported: the visibility promise holds for admins too (whole-database
 * backups are D1 Time Travel's job, see SETUP.md).
 */
export async function exportData(db: Db, actor: Actor) {
  const projects = (await memberProjects(db, actor.id)).map((p) => p.id);
  const [proj, members, columns, tasks, prompts, runs, rooms] = await Promise.all([
    inChunks(projects, (ids) =>
      db
        .select({
          id: project.id,
          name: project.name,
          repo: githubRepo.fullName,
          archivedAt: project.archivedAt,
        })
        .from(project)
        .innerJoin(githubRepo, eq(githubRepo.id, project.repoId))
        .where(inArray(project.id, ids)),
    ),
    inChunks(projects, (ids) =>
      db
        .select({ projectId: projectMember.projectId, name: user.name, role: projectMember.role })
        .from(projectMember)
        .innerJoin(user, eq(user.id, projectMember.userId))
        .where(inArray(projectMember.projectId, ids)),
    ),
    inChunks(projects, (ids) =>
      db.select().from(kanbanColumn).where(inArray(kanbanColumn.projectId, ids)),
    ),
    inChunks(projects, (ids) =>
      db
        .select({
          id: taskMeta.id,
          projectId: taskMeta.projectId,
          path: taskMeta.path,
          text: taskMeta.text,
          done: taskMeta.done,
          priority: taskMeta.priority,
          dueDate: taskMeta.dueDate,
          notes: taskMeta.notes,
          columnId: taskMeta.columnId,
          assignee: user.name,
        })
        .from(taskMeta)
        .leftJoin(user, eq(user.id, taskMeta.assigneeId))
        .where(and(inArray(taskMeta.projectId, ids), isNull(taskMeta.orphanedAt))),
    ),
    inChunks(projects, (ids) =>
      db
        .select({
          id: prompt.id,
          projectId: prompt.projectId,
          title: prompt.title,
          status: prompt.status,
        })
        .from(prompt)
        .where(inArray(prompt.projectId, ids)),
    ),
    inChunks(projects, (ids) =>
      db
        .select({
          id: promptRun.id,
          projectId: promptRun.projectId,
          taskText: promptRun.taskText,
          state: promptRun.state,
          prUrl: promptRun.prUrl,
          copiedAt: promptRun.copiedAt,
        })
        .from(promptRun)
        .where(inArray(promptRun.projectId, ids)),
    ),
    db
      .select({
        id: chatRoom.id,
        kind: chatRoom.kind,
        projectId: chatRoom.projectId,
        title: chatRoom.title,
      })
      .from(chatRoom),
  ]);
  const versions = await inChunks(
    prompts.map((p) => p.id),
    (ids) =>
      db
        .select({
          promptId: promptVersion.promptId,
          number: promptVersion.number,
          body: promptVersion.body,
          createdAt: promptVersion.createdAt,
        })
        .from(promptVersion)
        .where(inArray(promptVersion.promptId, ids)),
  );
  const visibleRooms = rooms.filter(
    (r) => r.kind === 'general' || (r.projectId && projects.includes(r.projectId)),
  );
  const messages = await inChunks(
    visibleRooms.map((r) => r.id),
    (ids) =>
      db
        .select({
          roomId: chatMessage.roomId,
          author: user.name,
          body: chatMessage.body,
          createdAt: chatMessage.createdAt,
          editedAt: chatMessage.editedAt,
        })
        .from(chatMessage)
        .leftJoin(user, eq(user.id, chatMessage.authorId))
        .where(and(inArray(chatMessage.roomId, ids), isNull(chatMessage.deletedAt)))
        .orderBy(chatMessage.roomId, chatMessage.seq),
  );
  const columnName = new Map(columns.map((c) => [c.id, c.name]));
  return {
    exportedAt: new Date().toISOString(),
    projects: proj.map((p) => ({
      name: p.name,
      repo: p.repo,
      archived: p.archivedAt !== null,
      members: members
        .filter((m) => m.projectId === p.id)
        .map(({ name, role }) => ({ name, role })),
      columns: columns
        .filter((c) => c.projectId === p.id)
        .sort((a, b) => a.position - b.position)
        .map((c) => c.name),
      tasks: tasks
        .filter((t) => t.projectId === p.id)
        .map(({ id: _id, projectId: _p, columnId, ...t }) => ({
          ...t,
          column: columnId ? (columnName.get(columnId) ?? null) : null,
        })),
      prompts: prompts
        .filter((x) => x.projectId === p.id)
        .map((x) => ({
          title: x.title,
          status: x.status,
          versions: versions
            .filter((v) => v.promptId === x.id)
            .sort((a, b) => a.number - b.number)
            .map((v) => ({ number: v.number, at: v.createdAt.toISOString(), body: v.body })),
        })),
      runs: runs
        .filter((r) => r.projectId === p.id)
        .map((r) => ({
          id: r.id,
          task: r.taskText,
          state: r.state,
          pr: r.prUrl,
          at: r.copiedAt.toISOString(),
        })),
    })),
    discussions: visibleRooms
      .map((r) => ({
        room:
          r.kind === 'general'
            ? 'Chat del gruppo'
            : `${proj.find((p) => p.id === r.projectId)?.name ?? ''}${r.title ? ` · ${r.title}` : ''} (${r.kind})`,
        messages: messages
          .filter((m) => m.roomId === r.id)
          .map((m) => ({
            author: m.author ?? '—',
            at: m.createdAt.toISOString(),
            edited: m.editedAt !== null,
            body: m.body,
          })),
      }))
      .filter((r) => r.messages.length),
  };
}

type Export = Awaited<ReturnType<typeof exportData>>;

/** The same export, readable by a person. */
export function exportMarkdown(data: Export): string {
  const out: string[] = [`# Kyon — esportazione del ${data.exportedAt.slice(0, 10)}`, ''];
  for (const p of data.projects) {
    out.push(`## ${p.name}${p.archived ? ' (archiviato)' : ''}`, '', `Repo: ${p.repo}`, '');
    out.push(`Membri: ${p.members.map((m) => `${m.name} (${m.role})`).join(', ')}`, '');
    out.push('### Task', '');
    for (const t of p.tasks)
      out.push(
        `- [${t.done ? 'x' : ' '}] ${t.text}` +
          [
            t.column && `colonna: ${t.column}`,
            t.assignee && `a: ${t.assignee}`,
            t.priority !== 'none' && `priorità: ${t.priority}`,
            t.dueDate && `scadenza: ${t.dueDate}`,
          ]
            .filter(Boolean)
            .map((x) => ` · ${x}`)
            .join('') +
          (t.notes ? `\n  > ${t.notes.replace(/\n/g, '\n  > ')}` : ''),
      );
    out.push('');
    for (const x of p.prompts) {
      out.push(`### Prompt: ${x.title} (${x.status})`, '');
      for (const v of x.versions)
        out.push(`Versione ${v.number} · ${v.at}`, '', '```', v.body, '```', '');
    }
    if (p.runs.length) {
      out.push('### Esecuzioni', '');
      for (const r of p.runs)
        out.push(`- ${r.id} · ${r.state} · ${r.task}${r.pr ? ` · ${r.pr}` : ''}`);
      out.push('');
    }
  }
  for (const d of data.discussions) {
    out.push(`## ${d.room}`, '');
    for (const m of d.messages)
      out.push(`**${m.author}** · ${m.at}${m.edited ? ' (modificato)' : ''}`, '', m.body, '');
  }
  return out.join('\n');
}
