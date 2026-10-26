import { describe, expect, it } from 'vitest';
import {
  can,
  type Actor,
  type Exposure,
  type ProjectAction,
  type ProjectRole,
  type RepoAction,
} from './can';

const alice: Actor = { id: 'alice', role: 'user' };
const bob: Actor = { id: 'bob', role: 'user' };
const admin: Actor = { id: 'root', role: 'admin' };

describe('can() — repos (exposure × who × action)', () => {
  // [exposure, available, sharedWithBob, viewer, action, expected]
  type Row = [Exposure, boolean, boolean, 'owner' | 'bob' | 'admin', RepoAction, boolean];
  const table: Row[] = [
    // The exposing user always sees and configures their own repo (even hidden or unavailable).
    ['hidden', true, false, 'owner', 'repo:view', true],
    ['hidden', true, false, 'owner', 'repo:configure', true],
    ['hidden', true, false, 'owner', 'repo:create_project', false],
    ['self', true, false, 'owner', 'repo:create_project', true],
    ['self', false, false, 'owner', 'repo:view', true],
    ['self', false, false, 'owner', 'repo:create_project', false],
    // Others: hidden and self are invisible.
    ['hidden', true, true, 'bob', 'repo:view', false],
    ['self', true, true, 'bob', 'repo:view', false],
    ['self', true, false, 'bob', 'repo:create_project', false],
    // Selected: only the people picked.
    ['selected', true, true, 'bob', 'repo:view', true],
    ['selected', true, true, 'bob', 'repo:create_project', true],
    ['selected', true, false, 'bob', 'repo:view', false],
    ['selected', false, true, 'bob', 'repo:view', false],
    // Group: everyone, while available.
    ['group', true, false, 'bob', 'repo:view', true],
    ['group', true, false, 'bob', 'repo:create_project', true],
    ['group', false, false, 'bob', 'repo:view', false],
    ['group', true, false, 'bob', 'repo:configure', false],
    // Admins get no special visibility: the visibility choice is a promise.
    ['self', true, false, 'admin', 'repo:view', false],
    ['selected', true, false, 'admin', 'repo:view', false],
    ['group', true, false, 'admin', 'repo:view', true],
    ['group', true, false, 'admin', 'repo:configure', false],
  ];
  for (const [exposure, available, shared, who, action, expected] of table) {
    it(`${who} ${action} on ${exposure}${available ? '' : ' (unavailable)'}${shared ? ' shared' : ''} → ${expected}`, () => {
      const actor = who === 'owner' ? alice : who === 'bob' ? bob : admin;
      const resource = {
        kind: 'repo' as const,
        exposedBy: alice.id,
        exposure,
        sharedWith: shared ? [bob.id] : [],
        available,
      };
      expect(can(actor, action, resource)).toBe(expected);
    });
  }
});

describe('can() — projects (role × action × state), full truth table', () => {
  const actions: ProjectAction[] = [
    'project:view',
    'project:edit_tasks',
    'project:write_prompt',
    'project:run_prompt',
    'project:comment',
    'project:chat',
    'project:settings',
    'project:manage_members',
    'project:transfer',
    'project:archive',
    'project:delete',
    'project:leave',
  ];
  const roles: (ProjectRole | null)[] = ['owner', 'member', 'viewer', null];

  // Expected results written out by hand (not derived from the implementation).
  // Columns follow `actions`. o = allowed.
  const expected: Record<string, string> = {
    // active project, viewers cannot comment
    'owner|active|no': 'o o o o o o o o o o o .',
    'member|active|no': 'o o o o o o . . . . . o',
    'viewer|active|no': 'o . . . . . . . . . . o',
    'none|active|no': '. . . . . . . . . . . .',
    // active project, viewers can comment
    'owner|active|yes': 'o o o o o o o o o o o .',
    'member|active|yes': 'o o o o o o . . . . . o',
    'viewer|active|yes': 'o . . . o . . . . . . o',
    'none|active|yes': '. . . . . . . . . . . .',
    // archived: read-only, owner can still restore (archive) or delete
    'owner|archived|no': 'o . . . . . . . . o o .',
    'member|archived|no': 'o . . . . . . . . . . o',
    'viewer|archived|yes': 'o . . . . . . . . . . o',
    'none|archived|no': '. . . . . . . . . . . .',
  };

  for (const [key, row] of Object.entries(expected)) {
    const [roleKey, state, comment] = key.split('|');
    const membership = roles.find((r) => (r ?? 'none') === roleKey) ?? null;
    const flags = row.split(/\s+/);
    actions.forEach((action, i) => {
      const allowed = flags[i] === 'o';
      it(`${roleKey} · ${state} · viewersCanComment=${comment}: ${action} → ${allowed}`, () => {
        expect(
          can(alice, action, {
            kind: 'project',
            membership,
            archived: state === 'archived',
            viewersCanComment: comment === 'yes',
          }),
        ).toBe(allowed);
      });
    });
  }

  it('gives global admins no access to projects they are not in', () => {
    expect(
      can(admin, 'project:view', {
        kind: 'project',
        membership: null,
        archived: false,
        viewersCanComment: true,
      }),
    ).toBe(false);
  });
});

describe('can() — group', () => {
  it('reserves admin actions to admins', () => {
    for (const action of [
      'admin:invites',
      'admin:users',
      'admin:export',
      'admin:health',
    ] as const) {
      expect(can(admin, action, { kind: 'group' })).toBe(true);
      expect(can(alice, action, { kind: 'group' })).toBe(false);
    }
    expect(can(alice, 'group:chat', { kind: 'group' })).toBe(true);
  });
});
