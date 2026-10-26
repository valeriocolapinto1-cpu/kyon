/**
 * Product-wide limits and defaults shared by the web app, the workers and the tests.
 * Keep these in one place so the UI, the API validation and the docs never drift apart.
 */

/** Maximum size of a chat/task attachment, after client-side image compression. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Default lifetime of an invite code. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** How long an orphaned task (gone from the repo) stays in the archive area. */
export const ORPHANED_TASK_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Default quiet hours for notifications, as local "HH:MM" in the user's time zone. */
export const DEFAULT_QUIET_HOURS = { start: '23:00', end: '08:00' } as const;

/** Default time zone used to format dates when the user has not chosen one. */
export const DEFAULT_TIME_ZONE = 'Europe/Rome';

/** Bundle size alarm threshold per Worker, gzip bytes (Free plan hard limit is 3 MB). */
export const WORKER_GZIP_ALARM_BYTES = 2.4 * 1024 * 1024;

/** Free plan hard limit per Worker, gzip bytes. */
export const WORKER_GZIP_LIMIT_BYTES = 3 * 1024 * 1024;
