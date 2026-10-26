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
import * as projectRoutes from './routes/project';
import * as projects from './routes/projects';
import * as repos from './routes/repos';
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
  ['/api/projects/:id/members/:userId', { PATCH: projectRoutes.memberRoleRoute, DELETE: projectRoutes.removeMemberRoute }],
  ['/api/projects/:id/leave', { POST: projectRoutes.leaveRoute }],
  ['/api/projects/:id/transfer', { POST: projectRoutes.transferRoute }],
  ['/api/projects/:id/archive', { POST: projectRoutes.archiveRoute }],
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
