import { suggestedBranch } from './marker';

export const RUN_STATES = [
  'copied',
  'pr_open',
  'ci_running',
  'ci_failed',
  'ci_passed',
  'merged',
  'closed',
  'abandoned',
] as const;
export type RunState = (typeof RUN_STATES)[number];

/** Runs still waiting for something to happen (shown as "in corso"). */
export const ACTIVE_RUN_STATES: RunState[] = [
  'copied',
  'pr_open',
  'ci_running',
  'ci_failed',
  'ci_passed',
];

export interface PullInfo {
  state: 'open' | 'closed';
  merged: boolean;
}

export interface CheckInfo {
  status: 'queued' | 'in_progress' | 'completed' | string;
  conclusion: string | null;
}

/** CI summary of a commit's check runs: none, running, failed or passed. */
export function ciState(checks: CheckInfo[]): 'none' | 'running' | 'failed' | 'passed' {
  if (!checks.length) return 'none';
  if (checks.some((c) => c.status !== 'completed')) return 'running';
  const bad = ['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure'];
  if (checks.some((c) => c.conclusion && bad.includes(c.conclusion))) return 'failed';
  return 'passed';
}

/** The run state that GitHub's facts imply. Merged wins; closed unmerged is "closed". */
export function runStateFrom(pull: PullInfo, checks: CheckInfo[]): RunState {
  if (pull.merged) return 'merged';
  if (pull.state === 'closed') return 'closed';
  const ci = ciState(checks);
  return ci === 'none'
    ? 'pr_open'
    : ci === 'running'
      ? 'ci_running'
      : ci === 'failed'
        ? 'ci_failed'
        : 'ci_passed';
}

/** Timeline steps for the UI: copied → PR → CI → merged, each done / current / failed / todo. */
export function runTimeline(state: RunState) {
  type Step = 'done' | 'current' | 'failed' | 'todo';
  const order = {
    copied: 0,
    pr_open: 1,
    ci_running: 2,
    ci_failed: 2,
    ci_passed: 2,
    merged: 3,
    closed: 1,
    abandoned: 0,
  }[state];
  const steps: { key: 'copied' | 'pr' | 'ci' | 'merged'; status: Step }[] = (
    ['copied', 'pr', 'ci', 'merged'] as const
  ).map((key, i) => ({
    key,
    status: i < order ? 'done' : i === order ? 'current' : 'todo',
  }));
  if (state === 'merged') for (const s of steps) s.status = 'done';
  if (state === 'ci_failed' && steps[2]) steps[2].status = 'failed';
  if (state === 'ci_passed' && steps[2]) steps[2].status = 'done';
  if ((state === 'closed' || state === 'abandoned') && steps[order]) steps[order].status = 'failed';
  return steps;
}

export interface PullCandidate {
  number: number;
  title: string;
  body: string | null;
  headRef: string;
  createdAt: string;
  authorLogin: string | null;
  state: 'open' | 'closed';
}

function words(text: string): Set<string> {
  return new Set(
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n / Math.min(a.size, b.size);
}

/**
 * Fallback when no PR carries the marker: the most likely PR of the repo, opened after the
 * prompt was copied, scored on branch name, title/body vs task text and author. Kyon only
 * suggests it: a person confirms with one tap.
 */
export function suggestPull(
  run: { id: string; taskText: string; copiedAt: string; launcherLogin: string | null },
  pulls: PullCandidate[],
): { pull: PullCandidate; score: number; reasons: string[] } | null {
  const branch = suggestedBranch(run.id, run.taskText);
  const taskWords = words(run.taskText);
  let best: { pull: PullCandidate; score: number; reasons: string[] } | null = null;
  for (const pull of pulls) {
    if (new Date(pull.createdAt).getTime() < new Date(run.copiedAt).getTime()) continue;
    const reasons: string[] = [];
    let score = 0;
    if (pull.headRef === branch || pull.headRef.includes(run.id)) {
      score += 3;
      reasons.push('branch');
    } else if (overlap(words(pull.headRef), taskWords) >= 0.5) {
      score += 1.5;
      reasons.push('branch');
    }
    const text = overlap(words(`${pull.title} ${pull.body ?? ''}`), taskWords);
    if (text >= 0.4) {
      score += 2 * text;
      reasons.push('text');
    }
    if (run.launcherLogin && pull.authorLogin === run.launcherLogin) {
      score += 0.5;
      reasons.push('author');
    }
    if (pull.state === 'open') score += 0.25;
    if (score >= 1.5 && (!best || score > best.score)) best = { pull, score, reasons };
  }
  return best;
}
