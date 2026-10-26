/** Error thrown by `api()`; `message` is already a friendly Italian sentence. */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const OFFLINE_MESSAGE = 'Sei offline o il server non risponde. Riprova.';

/** JSON fetch against our own API. Throws ApiClientError on non-2xx. */
export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (json !== undefined) headers.set('content-type', 'application/json');
  let response: Response;
  try {
    response = await fetch(path, {
      ...rest,
      headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiClientError(0, 'offline', OFFLINE_MESSAGE);
  }
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const body = data as {
      error?: { code?: string; message?: string };
      code?: string;
      message?: string;
    } | null;
    // Our routes use { error: { code, message } }; Better Auth uses { code, message } in English.
    const code = body?.error?.code ?? body?.code ?? 'error';
    const message =
      body?.error?.message ?? betterAuthMessage(code) ?? 'Qualcosa è andato storto. Riprova.';
    throw new ApiClientError(response.status, code, message);
  }
  return data as T;
}

function betterAuthMessage(code: string): string | undefined {
  const map: Record<string, string> = {
    INVALID_EMAIL_OR_PASSWORD: 'Email o password non corretti.',
    INVALID_PASSWORD: 'La password attuale non è corretta.',
    INVALID_TOKEN: 'Questo link non è valido o è scaduto.',
    USER_ALREADY_EXISTS: 'Esiste già un account con questa email.',
    SESSION_EXPIRED: 'La sessione è scaduta: accedi di nuovo.',
  };
  return map[code];
}
