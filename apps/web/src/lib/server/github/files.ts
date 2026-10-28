import { GitHubError, gh, type GitHubConfig } from './client';

export interface RepoRef {
  owner: string;
  repo: string;
}

const enc = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export interface TreeEntry {
  path: string;
  sha: string;
}

/** Recursive tree of a branch. Returns null when unchanged since `etag` (304: costs no rate limit). */
export async function getTree(
  config: GitHubConfig,
  token: string,
  ref: RepoRef,
  branch: string,
  etag: string | null,
) {
  const res = await gh<{
    sha: string;
    tree: { path: string; type: string; sha: string }[];
    truncated: boolean;
  }>(
    config,
    token,
    'GET',
    `/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { etag },
  );
  if (res.status === 304) return null;
  return {
    sha: res.data.sha,
    etag: res.etag,
    truncated: res.data.truncated,
    blobs: res.data.tree
      .filter((e) => e.type === 'blob')
      .map((e) => ({ path: e.path, sha: e.sha })) as TreeEntry[],
  };
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function encodeBase64Utf8(text: string): string {
  let binary = '';
  for (const b of new TextEncoder().encode(text)) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** The file's content can't be obtained (e.g. over the blob API limit): never treat it as empty. */
export class FileUnreadableError extends Error {
  constructor(readonly path: string) {
    super(`File not readable: ${path}`);
  }
}

export async function getFile(
  config: GitHubConfig,
  token: string,
  ref: RepoRef,
  path: string,
  branch: string,
) {
  const res = await gh<{ sha: string; content: string; encoding: string }>(
    config,
    token,
    'GET',
    `/repos/${ref.owner}/${ref.repo}/contents/${enc(path)}?ref=${encodeURIComponent(branch)}`,
  );
  if (res.data.encoding === 'base64')
    return { sha: res.data.sha, content: decodeBase64Utf8(res.data.content) };
  // Over ~1 MB the Contents API answers with empty content and encoding "none": the blob API
  // still serves the file (up to 100 MB).
  const blob = await gh<{ content: string; encoding: string }>(
    config,
    token,
    'GET',
    `/repos/${ref.owner}/${ref.repo}/git/blobs/${encodeURIComponent(res.data.sha)}`,
  );
  if (blob.data.encoding !== 'base64') throw new FileUnreadableError(path);
  return { sha: res.data.sha, content: decodeBase64Utf8(blob.data.content) };
}

export class WriteConflictError extends Error {}

/** Contents API write with optimistic concurrency (`sha`). Throws WriteConflictError on 409. */
export async function putFile(
  config: GitHubConfig,
  token: string,
  ref: RepoRef,
  path: string,
  input: { content: string; sha: string | null; branch: string; message: string },
) {
  try {
    const res = await gh<{ content: { sha: string }; commit: { sha: string } }>(
      config,
      token,
      'PUT',
      `/repos/${ref.owner}/${ref.repo}/contents/${enc(path)}`,
      {
        body: {
          message: input.message,
          content: encodeBase64Utf8(input.content),
          branch: input.branch,
          ...(input.sha ? { sha: input.sha } : {}),
        },
      },
    );
    return { blobSha: res.data.content.sha, commitSha: res.data.commit.sha };
  } catch (error) {
    if (error instanceof GitHubError && (error.status === 409 || error.status === 422))
      throw new WriteConflictError(error.message);
    throw error;
  }
}

/** Creates `branch` from `from` if it doesn't exist yet. */
export async function ensureBranch(
  config: GitHubConfig,
  token: string,
  ref: RepoRef,
  branch: string,
  from: string,
) {
  try {
    await gh(
      config,
      token,
      'GET',
      `/repos/${ref.owner}/${ref.repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    );
    return;
  } catch (error) {
    if (!(error instanceof GitHubError) || error.status !== 404) throw error;
  }
  const base = await gh<{ object: { sha: string } }>(
    config,
    token,
    'GET',
    `/repos/${ref.owner}/${ref.repo}/git/ref/heads/${encodeURIComponent(from)}`,
  );
  await gh(config, token, 'POST', `/repos/${ref.owner}/${ref.repo}/git/refs`, {
    body: { ref: `refs/heads/${branch}`, sha: base.data.object.sha },
  });
}

/** Opens a PR from `head` to `base` unless one is already open. */
export async function ensurePullRequest(
  config: GitHubConfig,
  token: string,
  ref: RepoRef,
  head: string,
  base: string,
  title: string,
  body: string,
) {
  const open = await gh<{ number: number; html_url: string }[]>(
    config,
    token,
    'GET',
    `/repos/${ref.owner}/${ref.repo}/pulls?state=open&head=${encodeURIComponent(`${ref.owner}:${head}`)}`,
  );
  if (open.data.length) return open.data[0];
  const created = await gh<{ number: number; html_url: string }>(
    config,
    token,
    'POST',
    `/repos/${ref.owner}/${ref.repo}/pulls`,
    {
      body: { title, head, base, body },
    },
  );
  return created.data;
}
