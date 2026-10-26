import type { CheckInfo, PullCandidate } from '@kyon/core';
import { gh, type GitHubConfig } from './client';
import type { RepoRef } from './files';

/** The fields of a pull request Kyon cares about (same shape from the API and from webhooks). */
export interface GhPull {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  merged?: boolean;
  merged_at: string | null;
  created_at: string;
  updated_at?: string;
  html_url: string;
  user: { login: string } | null;
  head: { ref: string; sha: string };
  base?: { ref: string };
}

const repoPath = (ref: RepoRef) => `/repos/${ref.owner}/${ref.repo}`;

export const isMerged = (pull: GhPull) => Boolean(pull.merged || pull.merged_at);

export async function getPull(config: GitHubConfig, token: string, ref: RepoRef, number: number) {
  return (await gh<GhPull>(config, token, 'GET', `${repoPath(ref)}/pulls/${number}`)).data;
}

export async function listPulls(
  config: GitHubConfig,
  token: string,
  ref: RepoRef,
  state: 'open' | 'all',
  perPage = 30,
) {
  return (
    await gh<GhPull[]>(
      config,
      token,
      'GET',
      `${repoPath(ref)}/pulls?state=${state}&sort=created&direction=desc&per_page=${perPage}`,
    )
  ).data;
}

/** Commit messages of a PR (first 100: enough to find a trailer). */
export async function pullCommitMessages(
  config: GitHubConfig,
  token: string,
  ref: RepoRef,
  number: number,
) {
  const res = await gh<{ commit: { message: string } }[]>(
    config,
    token,
    'GET',
    `${repoPath(ref)}/pulls/${number}/commits?per_page=100`,
  );
  return res.data.map((c) => c.commit.message);
}

export async function checkRuns(config: GitHubConfig, token: string, ref: RepoRef, sha: string) {
  const res = await gh<{
    check_runs: (CheckInfo & { name: string; html_url?: string })[];
  }>(
    config,
    token,
    'GET',
    `${repoPath(ref)}/commits/${encodeURIComponent(sha)}/check-runs?per_page=100`,
  );
  return res.data.check_runs;
}

export async function listCommits(
  config: GitHubConfig,
  token: string,
  ref: RepoRef,
  branch: string,
  perPage = 10,
) {
  const res = await gh<
    {
      sha: string;
      html_url: string;
      commit: { message: string; author: { name: string; date: string } | null };
      author: { login: string } | null;
    }[]
  >(
    config,
    token,
    'GET',
    `${repoPath(ref)}/commits?sha=${encodeURIComponent(branch)}&per_page=${perPage}`,
  );
  return res.data;
}

/** Open issues only (GitHub mixes PRs into /issues: they carry `pull_request`). */
export async function listOpenIssues(config: GitHubConfig, token: string, ref: RepoRef) {
  const res = await gh<
    {
      number: number;
      title: string;
      html_url: string;
      created_at: string;
      user: { login: string } | null;
      pull_request?: unknown;
    }[]
  >(config, token, 'GET', `${repoPath(ref)}/issues?state=open&per_page=20`);
  return res.data.filter((i) => !i.pull_request);
}

export const toCandidate = (pull: GhPull): PullCandidate => ({
  number: pull.number,
  title: pull.title,
  body: pull.body,
  headRef: pull.head.ref,
  createdAt: pull.created_at,
  authorLogin: pull.user?.login ?? null,
  state: pull.state,
});
