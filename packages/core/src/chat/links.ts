/**
 * Link recognition for previews. Kyon only previews GitHub (PR, issue, commit) and its own pages:
 * never arbitrary URLs (the server would fetch them: SSRF).
 */
export type PreviewTarget =
  | {
      kind: 'github_pull' | 'github_issue';
      owner: string;
      repo: string;
      number: number;
      url: string;
    }
  | { kind: 'github_commit'; owner: string; repo: string; sha: string; url: string }
  | { kind: 'kyon_project'; projectId: string; taskId: string | null; url: string };

const URL_RE = /\bhttps?:\/\/[^\s<>()"'`]+/gi;
const NAME = '[A-Za-z0-9_.-]+';

export function parsePreviewTarget(raw: string, kyonOrigin: string | null): PreviewTarget | null {
  let url: URL;
  try {
    url = new URL(raw.replace(/[.,;:!?)\]]+$/, ''));
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.hostname === 'github.com' && url.protocol === 'https:') {
    const m = new RegExp(`^/(${NAME})/(${NAME})/(pull|issues|commit)/([0-9a-fA-F]+|\\d+)/?$`).exec(
      url.pathname,
    );
    if (!m) return null;
    const [, owner = '', repo = '', type, ref = ''] = m;
    if (type === 'commit') {
      if (!/^[0-9a-f]{7,40}$/i.test(ref)) return null;
      return { kind: 'github_commit', owner, repo, sha: ref.toLowerCase(), url: url.toString() };
    }
    if (!/^\d{1,9}$/.test(ref)) return null;
    return {
      kind: type === 'pull' ? 'github_pull' : 'github_issue',
      owner,
      repo,
      number: Number(ref),
      url: url.toString(),
    };
  }
  if (kyonOrigin && url.origin === kyonOrigin && url.pathname === '/progetti') {
    const projectId = url.searchParams.get('id');
    if (!projectId || !/^[A-Za-z0-9-]{1,64}$/.test(projectId)) return null;
    const task = url.searchParams.get('task');
    return {
      kind: 'kyon_project',
      projectId,
      taskId: task && /^[A-Za-z0-9-]{1,64}$/.test(task) ? task : null,
      url: url.toString(),
    };
  }
  return null;
}

/** Previewable links of a message (first 3, deduplicated), outside code. */
export function previewTargets(text: string, kyonOrigin: string | null): PreviewTarget[] {
  const plain = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ');
  const out: PreviewTarget[] = [];
  for (const [match] of plain.matchAll(URL_RE)) {
    const target = parsePreviewTarget(match, kyonOrigin);
    if (target && !out.some((t) => t.url === target.url)) out.push(target);
    if (out.length === 3) break;
  }
  return out;
}
