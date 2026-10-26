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

// ---------- Tasks (the repo is the source of truth; these are metadata and caches) ----------

export const kanbanColumn = sqliteTable(
  'kanban_column',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    /** The "Fatto" column: moving a task in or out ticks/unticks it in the repo. */
    isDone: integer('is_done', { mode: 'boolean' }).notNull().default(false),
    /** The column tasks move to when a prompt is copied ("In corso"). */
    isInProgress: integer('is_in_progress', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('kanban_column_project_idx').on(t.projectId)],
);

export const taskMeta = sqliteTable(
  'task_meta',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    stableId: text('stable_id').notNull(),
    path: text('path').notNull(),
    /** JSON string[] */
    headingPath: text('heading_path').notNull(),
    /** Last known text (for similarity matching and the orphan archive). */
    text: text('text').notNull(),
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
    assigneeId: text('assignee_id').references(() => user.id, { onDelete: 'set null' }),
    /** urgent | high | medium | low | none */
    priority: text('priority').notNull().default('none'),
    /** YYYY-MM-DD (a day, not an instant). */
    dueDate: text('due_date'),
    columnId: text('column_id').references(() => kanbanColumn.id, { onDelete: 'set null' }),
    position: integer('position').notNull().default(0),
    notes: text('notes'),
    orphanedAt: timestamp('orphaned_at'),
    createdAt: timestamp('created_at').notNull().default(now),
    updatedAt: timestamp('updated_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('task_meta_stable_idx').on(t.projectId, t.stableId),
    index('task_meta_assignee_idx').on(t.assigneeId),
    index('task_meta_due_idx').on(t.dueDate),
  ],
);

export const taskLabel = sqliteTable(
  'task_label',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('blue'),
  },
  (t) => [uniqueIndex('task_label_name_idx').on(t.projectId, t.name)],
);

export const taskLabelLink = sqliteTable(
  'task_label_link',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => taskMeta.id, { onDelete: 'cascade' }),
    labelId: text('label_id')
      .notNull()
      .references(() => taskLabel.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('task_label_link_idx').on(t.taskId, t.labelId)],
);

/** Parsed snapshot of one .md file at a given blob sha (incremental re-parse). */
export const taskFile = sqliteTable(
  'task_file',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    blobSha: text('blob_sha').notNull(),
    /** tasks | archive */
    kind: text('kind').notNull().default('tasks'),
    /** JSON: { tasks: ParsedTask[], tables: TableBlock[] } */
    parsed: text('parsed').notNull(),
    updatedAt: timestamp('updated_at').notNull().default(now),
  },
  (t) => [uniqueIndex('task_file_idx').on(t.projectId, t.path)],
);

/** Sync bookkeeping per project: tree ETag, files still to fetch, last error. */
export const projectSync = sqliteTable('project_sync', {
  projectId: text('project_id')
    .primaryKey()
    .references(() => project.id, { onDelete: 'cascade' }),
  branch: text('branch'),
  treeSha: text('tree_sha'),
  treeEtag: text('tree_etag'),
  /** JSON string[]: .md paths changed but not fetched yet (subrequest budget). */
  pending: text('pending'),
  lastSyncAt: timestamp('last_sync_at'),
  lastError: text('last_error'),
});

export const activityEvent = sqliteTable(
  'activity_event',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').references(() => project.id, { onDelete: 'cascade' }),
    /** null when the change came from GitHub (a push) or the system. */
    actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
    /** The task it is about, if any (task history in the detail panel). */
    taskId: text('task_id'),
    type: text('type').notNull(),
    /** JSON payload, shape depends on type. */
    payload: text('payload').notNull(),
    createdAt: timestamp('created_at').notNull().default(now),
  },
  (t) => [
    index('activity_project_idx').on(t.projectId, t.createdAt),
    index('activity_task_idx').on(t.taskId, t.createdAt),
  ],
);
