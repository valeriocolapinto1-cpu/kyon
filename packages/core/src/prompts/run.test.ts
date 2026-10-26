import { describe, expect, it } from 'vitest';
import { diffLines } from './diff';
import { ciState, runStateFrom, runTimeline, suggestPull, type PullCandidate } from './run';
import {
  DEFAULT_FOOTER,
  buildFullPrompt,
  renderTemplate,
  subtaskList,
  templateVariables,
} from './template';

const values = {
  project: 'Biohybrid',
  repo: 'cerbero/biohybrid',
  task: 'Validare il modello',
  file: 'PROSSIMI-PASSI.md',
  section: 'Biologia',
  branch: 'claude/k7f3a9qm-validare-il-modello',
  assignee: '',
  subtasks: subtaskList([{ text: 'Raccogliere dati', done: true }]),
  run_id: 'k7f3a9qm',
};

describe('templates', () => {
  it('replaces known variables, keeps and reports unknown ones, never leaves values empty', () => {
    const r = renderTemplate('{{ task }} per {{assignee}} in {{progetto}} {{project}}', values);
    expect(r.text).toBe('Validare il modello per (nessuno) in {{progetto}} Biohybrid');
    expect(r.unknown).toEqual(['progetto']);
    expect(templateVariables('{{task}} {{x}} {{task}}')).toEqual({
      known: ['task'],
      unknown: ['x'],
    });
  });

  it('builds the full prompt with the footer and the marker line', () => {
    const { text, unknown } = buildFullPrompt('Fai **{{task}}**.', DEFAULT_FOOTER, values);
    expect(text).toContain('Fai **Validare il modello**.');
    expect(text).toContain('`Kyon-Run: k7f3a9qm`');
    expect(text).toContain('CLAUDE.md');
    expect(text).toContain('claude/k7f3a9qm-validare-il-modello');
    expect(text).toContain('  - [x] Raccogliere dati');
    expect(unknown).toEqual([]);
  });

  it('adds the marker even when an admin footer forgets it', () => {
    const { text } = buildFullPrompt('Corpo', 'Solo un saluto', values);
    expect(text).toContain('Kyon-Run: k7f3a9qm');
  });
});

describe('run state', () => {
  it('derives CI and run states', () => {
    expect(ciState([])).toBe('none');
    expect(ciState([{ status: 'in_progress', conclusion: null }])).toBe('running');
    expect(
      ciState([
        { status: 'completed', conclusion: 'success' },
        { status: 'completed', conclusion: 'skipped' },
      ]),
    ).toBe('passed');
    expect(
      ciState([
        { status: 'completed', conclusion: 'success' },
        { status: 'completed', conclusion: 'failure' },
      ]),
    ).toBe('failed');
    expect(runStateFrom({ state: 'open', merged: false }, [])).toBe('pr_open');
    expect(
      runStateFrom({ state: 'open', merged: false }, [{ status: 'queued', conclusion: null }]),
    ).toBe('ci_running');
    expect(
      runStateFrom({ state: 'closed', merged: true }, [
        { status: 'completed', conclusion: 'failure' },
      ]),
    ).toBe('merged');
    expect(runStateFrom({ state: 'closed', merged: false }, [])).toBe('closed');
  });

  it('builds the timeline', () => {
    expect(runTimeline('copied').map((s) => s.status)).toEqual(['current', 'todo', 'todo', 'todo']);
    expect(runTimeline('ci_failed').map((s) => s.status)).toEqual([
      'done',
      'done',
      'failed',
      'todo',
    ]);
    expect(runTimeline('ci_passed').map((s) => s.status)).toEqual(['done', 'done', 'done', 'todo']);
    expect(runTimeline('merged').map((s) => s.status)).toEqual(['done', 'done', 'done', 'done']);
    expect(runTimeline('closed').map((s) => s.status)).toEqual(['done', 'failed', 'todo', 'todo']);
  });
});

describe('suggestPull', () => {
  const run = {
    id: 'k7f3a9qm',
    taskText: 'Validare il modello di crescita',
    copiedAt: '2026-10-26T10:00:00Z',
    launcherLogin: 'valerio',
  };
  const pull = (p: Partial<PullCandidate>): PullCandidate => ({
    number: 1,
    title: 'Varie',
    body: null,
    headRef: 'fix/varie',
    createdAt: '2026-10-26T11:00:00Z',
    authorLogin: 'altro',
    state: 'open',
    ...p,
  });

  it('prefers the suggested branch, then text and author; ignores older PRs', () => {
    const best = suggestPull(run, [
      pull({
        number: 1,
        title: 'Validare il modello di crescita',
        createdAt: '2026-10-25T00:00:00Z',
      }),
      pull({ number: 2, title: 'Validare modello crescita', authorLogin: 'valerio' }),
      pull({ number: 3, headRef: 'claude/k7f3a9qm-validare' }),
    ]);
    expect(best?.pull.number).toBe(3);
    expect(
      suggestPull(run, [pull({ number: 2, title: 'Validare modello crescita' })])?.reasons,
    ).toEqual(['text']);
  });

  it('suggests nothing when nothing is plausible', () => {
    expect(
      suggestPull(run, [pull({ title: 'Aggiorna dipendenze', authorLogin: 'valerio' })]),
    ).toBeNull();
  });
});

describe('diffLines', () => {
  it('marks added and removed lines', () => {
    expect(diffLines('a\nb\nc', 'a\nc\nd')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'remove', text: 'b' },
      { kind: 'same', text: 'c' },
      { kind: 'add', text: 'd' },
    ]);
  });
});

import { claudeMdFor } from './claudeMd';

describe('claudeMdFor', () => {
  it('explains tasks, branches and the marker', () => {
    const md = claudeMdFor({
      project: 'Biohybrid',
      repo: 'cerbero/biohybrid',
      defaultBranch: 'main',
      workBranch: null,
      commitMode: 'direct',
      taskFiles: ['PROSSIMI-PASSI.md'],
      planHeadings: ['Prossimi passi'],
    });
    expect(md).toContain('`PROSSIMI-PASSI.md`');
    expect(md).toContain('Kyon-Run: <id>');
    expect(md).toContain('verso `main`');
  });
});
