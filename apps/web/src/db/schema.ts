import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });
const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/**
 * Small key/value table for operational markers (last cron run, ...).
 */
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

// ---------- Better Auth core tables (+ Kyon profile fields on user) ----------

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().default(now),
  updatedAt: timestamp('updated_at').notNull().default(now),
  /** Global role: 'admin' or 'user'. The first account is the admin. */
  role: text('role').notNull().default('user'),
  // Kyon profile
  bio: text('bio'),
  statusText: text('status_text'),
  avatarKey: text('avatar_key'),
  /** JSON of @kyon/core Preferences (theme, accent, accessibility, clock). */
  preferences: text('preferences'),
  /** JSON: ordered, visible Home blocks. */
  homeLayout: text('home_layout'),
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').notNull().default(now),
    updatedAt: timestamp('updated_at').notNull().default(now),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_idx').on(t.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').notNull().default(now),
    updatedAt: timestamp('updated_at').notNull().default(now),
  },
  (t) => [index('account_user_idx').on(t.userId)],
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().default(now),
    updatedAt: timestamp('updated_at').notNull().default(now),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

// ---------- Invites ----------

export const invite = sqliteTable(
  'invite',
  {
    id: text('id').primaryKey(),
    /** SHA-256 of the normalized code; the code itself is shown once and never stored. */
    codeHash: text('code_hash').notNull(),
    note: text('note'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().default(now),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    usedBy: text('used_by').references(() => user.id, { onDelete: 'set null' }),
    revokedAt: timestamp('revoked_at'),
  },
  (t) => [uniqueIndex('invite_code_hash_idx').on(t.codeHash)],
);
