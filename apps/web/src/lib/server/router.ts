import { Hono } from 'hono';
import * as adminInvite from './routes/adminInvite';
import * as adminInvites from './routes/adminInvites';
import * as adminResetLink from './routes/adminResetLink';
import * as adminSessions from './routes/adminSessions';
import * as adminUser from './routes/adminUser';
import * as adminUsers from './routes/adminUsers';
import * as auth from './routes/auth';
import * as github from './routes/github';
import * as githubWebhook from './routes/githubWebhook';
import * as people from './routes/people';
import * as home from './routes/home';
import * as notifications from './routes/notifications';
import * as projectRoutes from './routes/project';
import * as projects from './routes/projects';
import * as repos from './routes/repos';
import * as tasks from './routes/tasks';
import * as realtime from './routes/realtime';
import * as prompts from './routes/prompts';
import * as chat from './routes/chat';
import * as internal from './routes/internal';
import * as avatarFile from './routes/avatarFile';
import * as health from './routes/health';
import * as join from './routes/join';
import * as me from './routes/me';
import * as meAvatar from './routes/meAvatar';
import * as meEmail from './routes/meEmail';
import * as reset from './routes/reset';

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;
type Module = Partial<Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', Handler>>;

/**
 * The whole JSON API behind a single Next.js route (`app/api/[[...route]]`).
 * One route means one copy of the server code in the Worker bundle (Turbopack duplicates
 * shared code per route), and the API stays framework-independent (Plan B: plain Hono).
 */
const routes: [string, Module][] = [
  ['/api/health', health],
  ['/api/auth/*', auth],
  ['/api/join', join],
  ['/api/me', me],
  ['/api/me/avatar', meAvatar],
  ['/api/me/email', meEmail],
  ['/api/files/avatars/:userId', avatarFile],
  ['/api/reset/:token', reset],
  ['/api/admin/invites', adminInvites],
  ['/api/admin/invites/:id', adminInvite],
  ['/api/admin/users', adminUsers],
  ['/api/admin/users/:id', adminUser],
  ['/api/admin/users/:id/reset-link', adminResetLink],
  ['/api/admin/users/:id/sessions', adminSessions],
  ['/api/people', people],
  ['/api/people/:id', { GET: home.person }],
  ['/api/home', { GET: home.home }],
  ['/api/me/location', { PUT: home.location }],
  ['/api/me/tour', { PUT: home.tour }],
  [
    '/api/me/calendar',
    { GET: home.calendarState, POST: home.calendarRotate, DELETE: home.calendarRevoke },
  ],
  ['/api/calendar/:file', { GET: home.calendarFeed }],
  ['/api/search', { GET: home.search }],
  ['/api/activity', { GET: home.activity }],
  ['/api/notifications', { GET: notifications.list }],
  ['/api/notifications/read', { POST: notifications.read }],
  ['/api/notifications/setup', { GET: notifications.setup }],
  ['/api/notifications/test', { POST: notifications.test }],
  ['/api/me/notifications', notifications.prefs],
  ['/api/push/subscriptions', { POST: notifications.subscribe, DELETE: notifications.unsubscribe }],
  ['/api/github', github],
  ['/api/github/connect', { GET: github.connect }],
  ['/api/github/callback', { GET: github.callback }],
  ['/api/github/setup', { GET: github.setup }],
  ['/api/github/sync', { POST: github.sync }],
  ['/api/github/webhook', githubWebhook],
  ['/api/repos', repos],
  ['/api/repos/:id', repos],
  ['/api/projects', projects],
  ['/api/projects/:id', projectRoutes],
  ['/api/projects/:id/members', { POST: projectRoutes.addMemberRoute }],
  [
    '/api/projects/:id/members/:userId',
    { PATCH: projectRoutes.memberRoleRoute, DELETE: projectRoutes.removeMemberRoute },
  ],
  ['/api/projects/:id/leave', { POST: projectRoutes.leaveRoute }],
  ['/api/projects/:id/transfer', { POST: projectRoutes.transferRoute }],
  ['/api/projects/:id/archive', { POST: projectRoutes.archiveRoute }],
  ['/api/projects/:id/tasks', tasks],
  ['/api/projects/:id/tasks/:taskId', { PATCH: tasks.patchTask }],
  ['/api/projects/:id/tasks/:taskId/history', { GET: tasks.history }],
  ['/api/projects/:id/columns', { POST: tasks.columns }],
  ['/api/projects/:id/columns/:columnId', { PATCH: tasks.patchColumn, DELETE: tasks.removeColumn }],
  ['/api/projects/:id/labels', { POST: tasks.labels }],
  ['/api/projects/:id/labels/:labelId', { PATCH: tasks.patchLabel, DELETE: tasks.removeLabel }],
  ['/api/realtime/ticket', realtime],
  ['/api/projects/:id/prompts', { GET: prompts.projectPrompts, POST: prompts.createProjectPrompt }],
  ['/api/projects/:id/status', { GET: prompts.status }],
  ['/api/projects/:id/claude-md', prompts.claudeMd],
  ['/api/prompts/:promptId', { PATCH: prompts.patchPrompt, DELETE: prompts.removePrompt }],
  ['/api/prompts/:promptId/versions', { GET: prompts.versions }],
  ['/api/prompts/:promptId/restore', { POST: prompts.restore }],
  ['/api/prompts/:promptId/run', { POST: prompts.run }],
  ['/api/runs/:runId', { PATCH: prompts.patchRun }],
  ['/api/runs/:runId/text', { GET: prompts.text }],
  ['/api/runs/:runId/verify', { POST: prompts.verify }],
  ['/api/runs/:runId/suggestion', { GET: prompts.suggestion }],
  ['/api/runs/:runId/link', { POST: prompts.link }],
  ['/api/runs/:runId/undo-close', { POST: prompts.undoClose }],
  ['/api/templates', { GET: prompts.templates, POST: prompts.createTemplateRoute }],
  ['/api/templates/:templateId', { PATCH: prompts.patchTemplate, DELETE: prompts.removeTemplate }],
  ['/api/admin/prompt-footer', prompts.footer],
  ['/api/chat/rooms', { GET: chat.rooms }],
  ['/api/chat/rooms/:roomId', { PATCH: chat.room }],
  ['/api/chat/rooms/:roomId/messages', { GET: chat.messages, POST: chat.send }],
  ['/api/chat/rooms/:roomId/pins', { GET: chat.pins }],
  ['/api/chat/rooms/:roomId/read', { POST: chat.read }],
  ['/api/chat/rooms/:roomId/mute', chat.mute],
  ['/api/chat/rooms/:roomId/attachments', { PUT: chat.upload }],
  ['/api/chat/messages/:messageId', chat.message],
  ['/api/chat/messages/:messageId/reactions', { POST: chat.reaction }],
  ['/api/chat/messages/:messageId/pin', chat.pin],
  ['/api/chat/search', { GET: chat.search }],
  ['/api/chat/preview', { GET: chat.preview }],
  ['/api/projects/:id/threads', { POST: chat.threads }],
  ['/api/files/chat/:id', { GET: chat.file }],
  ['/api/projects/:id/sync', { POST: tasks.sync }],
  ['/api/projects/:id/tasks-file', { POST: tasks.tasksFile }],
  ['/api/internal/cron', { POST: internal.cron }],
];

export const api = new Hono();

for (const [path, module] of routes) {
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
    const handler = module[method];
    if (typeof handler !== 'function') continue;
    api.on(method, path, (c) =>
      handler(c.req.raw, { params: Promise.resolve(c.req.param() as Record<string, string>) }),
    );
  }
}

api.notFound(() =>
  Response.json({ error: { code: 'not_found', message: 'Non trovato.' } }, { status: 404 }),
);
