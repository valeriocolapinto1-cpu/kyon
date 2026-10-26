import { ApiError } from '../errors';

/**
 * Minimal GitHub REST client. Base URLs are configurable so tests and e2e can point it at the
 * fake GitHub server; production uses api.github.com and github.com.
 */
export interface GitHubConfig {
  apiUrl: string;
  webUrl: string;
  clientId: string;
  clientSecret: string;
  appSlug: string;
  fetch: typeof fetch;
}

export function githubConfig(env: CloudflareEnv, fetchImpl: typeof fetch = fetch): GitHubConfig {
  return {
    apiUrl: env.GITHUB_API_URL ?? 'https://api.github.com',
    webUrl: env.GITHUB_WEB_URL ?? 'https://github.com',
    clientId: env.GITHUB_APP_CLIENT_ID ?? '',
    clientSecret: env.GITHUB_APP_CLIENT_SECRET ?? '',
    appSlug: env.GITHUB_APP_SLUG ?? '',
    fetch: fetchImpl,
  };
}

export function githubConfigured(config: GitHubConfig): boolean {
  return Boolean(config.clientId && config.clientSecret && config.appSlug);
}

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface GitHubResponse<T> {
  status: number;
  data: T;
  etag: string | null;
  /** Value of the Link header, for pagination. */
  link: string | null;
}

export async function gh<T>(
  config: GitHubConfig,
  token: string,
  method: string,
  path: string,
  options: { body?: unknown; etag?: string | null } = {},
): Promise<GitHubResponse<T>> {
  const headers = new Headers({
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'Kyon',
    authorization: `Bearer ${token}`,
  });
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  if (options.etag) headers.set('if-none-match', options.etag);
  const url = path.startsWith('http') ? path : `${config.apiUrl}${path}`;
  const response = await config.fetch(url, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const etag = response.headers.get('etag');
  const link = response.headers.get('link');
  if (response.status === 304) return { status: 304, data: null as T, etag, link };
  const text = await response.text();
  const data = text ? (JSON.parse(text) as T) : (null as T);
  if (!response.ok) {
    const message = (data as { message?: string } | null)?.message ?? `GitHub ${response.status}`;
    throw new GitHubError(response.status, message);
  }
  return { status: response.status, data, etag, link };
}

/** Follows `Link: <...>; rel="next"` up to `maxPages` (Workers allow 50 subrequests per request). */
export async function ghPaginate<T, R>(
  config: GitHubConfig,
  token: string,
  path: string,
  pick: (page: T) => R[],
  maxPages = 5,
): Promise<R[]> {
  const items: R[] = [];
  let next: string | null = path;
  for (let page = 0; next && page < maxPages; page++) {
    const res: GitHubResponse<T> = await gh<T>(config, token, 'GET', next);
    items.push(...pick(res.data));
    next = /<([^>]+)>;\s*rel="next"/.exec(res.link ?? '')?.[1] ?? null;
  }
  return items;
}

export interface TokenSet {
  accessToken: string;
  accessTokenExpiresAt: Date | null;
  refreshToken: string | null;
  refreshTokenExpiresAt: Date | null;
}

async function tokenRequest(config: GitHubConfig, params: Record<string, string>): Promise<TokenSet> {
  const response = await config.fetch(`${config.webUrl}/login/oauth/access_token`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'Kyon' },
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, ...params }),
  });
  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !data.access_token) {
    throw new ApiError('bad_request', 'GitHub non ha confermato il collegamento. Riprova.');
  }
  const now = Date.now();
  return {
    accessToken: data.access_token,
    accessTokenExpiresAt: data.expires_in ? new Date(now + data.expires_in * 1000) : null,
    refreshToken: data.refresh_token ?? null,
    refreshTokenExpiresAt: data.refresh_token_expires_in ? new Date(now + data.refresh_token_expires_in * 1000) : null,
  };
}

export function exchangeCode(config: GitHubConfig, code: string, redirectUri: string): Promise<TokenSet> {
  return tokenRequest(config, { code, redirect_uri: redirectUri });
}

export function refreshAccessToken(config: GitHubConfig, refreshToken: string): Promise<TokenSet> {
  return tokenRequest(config, { grant_type: 'refresh_token', refresh_token: refreshToken });
}

export function authorizeUrl(config: GitHubConfig, redirectUri: string, state: string): string {
  const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: redirectUri, state });
  return `${config.webUrl}/login/oauth/authorize?${params}`;
}

export function installUrl(config: GitHubConfig): string {
  return `${config.webUrl}/apps/${config.appSlug}/installations/new`;
}
