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

// ---------- GitHub ----------

/** One per Kyon user who connected GitHub (GitHub App user authorization). Tokens are AES-GCM encrypted. */
export const githubConnection = sqliteTable('github_connection', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  githubUserId: integer('github_user_id').notNull(),
  login: text('login').notNull(),
  avatarUrl: text('avatar_url'),
  accessToken: text('access_token').notNull(),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshToken: text('refresh_token'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  lastSyncAt: timestamp('last_sync_at'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').notNull().default(now),
  updatedAt: timestamp('updated_at').notNull().default(now),
});

/**
 * A repo as seen by one Kyon user (through their GitHub authorization) and its exposure choice.
 * The same GitHub repo can appear for several users; the one who exposes it controls visibility.
 */
export const githubRepo = sqliteTable(
  'github_repo',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    githubRepoId: integer('github_repo_id').notNull(),
    installationId: integer('installation_id'),
    fullName: text('full_name').notNull(),
    ownerLogin: text('owner_login').notNull(),
    name: text('name').notNull(),
    private: integer('private', { mode: 'boolean' }).notNull().default(true),
    defaultBranch: text('default_branch').notNull().default('main'),
    htmlUrl: text('html_url').notNull(),
    /** hidden (default) | self | selected | group */
    exposure: text('exposure').notNull().default('hidden'),
    available: integer('available', { mode: 'boolean' }).notNull().default(true),
    createdAt: timestamp('created_at').notNull().default(now),
    updatedAt: timestamp('updated_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('github_repo_user_repo_idx').on(t.userId, t.githubRepoId),
    index('github_repo_repo_idx').on(t.githubRepoId),
  ],
);

export const githubRepoShare = sqliteTable(
  'github_repo_share',
  {
    repoId: text('repo_id')
      .notNull()
      .references(() => githubRepo.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('github_repo_share_idx').on(t.repoId, t.userId)],
);

// ---------- Projects ----------

export const project = sqliteTable(
  'project',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** The exposing row (whose owner's token is the fallback for GitHub calls). */
    repoId: text('repo_id')
      .notNull()
      .references(() => githubRepo.id, { onDelete: 'restrict' }),
    /** 1 project = 1 repo. */
    githubRepoId: integer('github_repo_id').notNull(),
    /** direct | branch_pr */
    commitMode: text('commit_mode').notNull().default('direct'),
    workBranch: text('work_branch'),
    viewersCanComment: integer('viewers_can_comment', { mode: 'boolean' }).notNull().default(false),
    /** JSON string[]: heading keywords that turn list items into tasks. */
    planHeadings: text('plan_headings'),
    /** JSON string[]: extra glob patterns to ignore. */
    ignoreGlobs: text('ignore_globs'),
    showArchive: integer('show_archive', { mode: 'boolean' }).notNull().default(false),
    archivedAt: timestamp('archived_at'),
    createdAt: timestamp('created_at').notNull().default(now),
    updatedAt: timestamp('updated_at').notNull().default(now),
  },
  (t) => [uniqueIndex('project_github_repo_idx').on(t.githubRepoId)],
);

export const projectMember = sqliteTable(
  'project_member',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** owner | member | viewer */
    role: text('role').notNull(),
    createdAt: timestamp('created_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('project_member_idx').on(t.projectId, t.userId),
    index('project_member_user_idx').on(t.userId),
  ],
);
