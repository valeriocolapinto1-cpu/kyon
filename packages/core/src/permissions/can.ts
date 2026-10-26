/**
 * Single source of truth for access control. Every route, server action, Durable Object,
 * file download, calendar feed and export asks `can()`. Never check roles inline.
 */

export type GlobalRole = 'admin' | 'user';
export type ProjectRole = 'owner' | 'member' | 'viewer';
export type Exposure = 'hidden' | 'self' | 'selected' | 'group';

export interface Actor {
  id: string;
  role: GlobalRole;
}

export interface RepoResource {
  kind: 'repo';
  /** Kyon user who connected the repo and controls its exposure. */
  exposedBy: string;
  exposure: Exposure;
  /** Users picked when exposure is 'selected'. */
  sharedWith: readonly string[];
  /** Still reachable through the GitHub App installation. */
  available: boolean;
}

export interface ProjectResource {
  kind: 'project';
  /** The actor's role in the project, or null when not a member. */
  membership: ProjectRole | null;
  viewersCanComment: boolean;
  archived: boolean;
}

export interface GroupResource {
  kind: 'group';
}

export type RepoAction = 'repo:view' | 'repo:configure' | 'repo:create_project';

export type ProjectAction =
  | 'project:view'
  | 'project:edit_tasks'
  | 'project:write_prompt'
  | 'project:run_prompt'
  | 'project:comment'
  | 'project:chat'
  | 'project:settings'
  | 'project:manage_members'
  | 'project:transfer'
  | 'project:archive'
  | 'project:delete'
  | 'project:leave';

export type GroupAction =
  'admin:invites' | 'admin:users' | 'admin:export' | 'admin:health' | 'group:chat';

export type Action = RepoAction | ProjectAction | GroupAction;

export function can(actor: Actor, action: RepoAction, resource: RepoResource): boolean;
export function can(actor: Actor, action: ProjectAction, resource: ProjectResource): boolean;
export function can(actor: Actor, action: GroupAction, resource: GroupResource): boolean;
export function can(
  actor: Actor,
  action: Action,
  resource: RepoResource | ProjectResource | GroupResource,
): boolean {
  switch (resource.kind) {
    case 'repo':
      return canOnRepo(actor, action as RepoAction, resource);
    case 'project':
      return canOnProject(action as ProjectAction, resource);
    case 'group':
      return canOnGroup(actor, action as GroupAction);
  }
}

function repoVisibleTo(actor: Actor, repo: RepoResource): boolean {
  if (repo.exposedBy === actor.id) return true;
  if (!repo.available) return false;
  switch (repo.exposure) {
    case 'hidden':
    case 'self':
      return false;
    case 'selected':
      return repo.sharedWith.includes(actor.id);
    case 'group':
      return true;
  }
}

function canOnRepo(actor: Actor, action: RepoAction, repo: RepoResource): boolean {
  switch (action) {
    case 'repo:view':
      return repoVisibleTo(actor, repo);
    case 'repo:configure':
      return repo.exposedBy === actor.id;
    case 'repo:create_project':
      // Only exposed, reachable repos can become projects, by people who can see them.
      return repo.available && repo.exposure !== 'hidden' && repoVisibleTo(actor, repo);
  }
}

/**
 * Project access depends only on membership: changing a repo's visibility never removes members
 * (the owner gets a warning instead). Global admins have no special access to projects.
 */
function canOnProject(action: ProjectAction, project: ProjectResource): boolean {
  const role = project.membership;
  if (!role) return false;
  const contributor = role === 'owner' || role === 'member';
  const editable = !project.archived;
  switch (action) {
    case 'project:view':
      return true;
    case 'project:edit_tasks':
    case 'project:write_prompt':
    case 'project:run_prompt':
    case 'project:chat':
      return contributor && editable;
    case 'project:comment':
      return editable && (contributor || project.viewersCanComment);
    case 'project:settings':
    case 'project:manage_members':
    case 'project:transfer':
      return role === 'owner' && editable;
    case 'project:archive':
    case 'project:delete':
      return role === 'owner';
    case 'project:leave':
      // The owner must transfer ownership first.
      return role !== 'owner';
  }
}

function canOnGroup(actor: Actor, action: GroupAction): boolean {
  switch (action) {
    case 'group:chat':
      return true;
    case 'admin:invites':
    case 'admin:users':
    case 'admin:export':
    case 'admin:health':
      return actor.role === 'admin';
  }
}
