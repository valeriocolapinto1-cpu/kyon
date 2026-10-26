import { Hono } from 'hono';
import * as adminInvite from './routes/adminInvite';
import * as adminInvites from './routes/adminInvites';
import * as adminResetLink from './routes/adminResetLink';
import * as adminSessions from './routes/adminSessions';
import * as adminUser from './routes/adminUser';
import * as adminUsers from './routes/adminUsers';
import * as auth from './routes/auth';
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
];

export const api = new Hono();

for (const [path, module] of routes) {
  for (const [method, handler] of Object.entries(module) as [string, Handler | undefined][]) {
    if (typeof handler !== 'function') continue;
    api.on(method, path, (c) =>
      handler(c.req.raw, { params: Promise.resolve(c.req.param() as Record<string, string>) }),
    );
  }
}

api.notFound(() =>
  Response.json({ error: { code: 'not_found', message: 'Non trovato.' } }, { status: 404 }),
);
