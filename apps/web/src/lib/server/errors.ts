/** Error codes returned by the JSON API. Messages are Italian and safe to show to users. */
export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'bad_request'
  | 'conflict'
  | 'rate_limited'
  | 'invalid_invite'
  | 'too_large'
  | 'unsupported_type'
  | 'unavailable'
  | 'internal';

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  bad_request: 400,
  conflict: 409,
  rate_limited: 429,
  invalid_invite: 400,
  too_large: 413,
  unsupported_type: 415,
  unavailable: 503,
  internal: 500,
};

const MESSAGES: Record<ApiErrorCode, string> = {
  unauthorized: 'Devi accedere per continuare.',
  forbidden: 'Non hai i permessi per farlo.',
  not_found: 'Non trovato.',
  bad_request: 'Richiesta non valida.',
  conflict: 'Qualcuno ha appena modificato la stessa cosa. Riprova.',
  rate_limited: 'Troppi tentativi. Aspetta un minuto e riprova.',
  invalid_invite: 'Questo invito non è valido o è scaduto.',
  too_large: 'Il file supera il limite consentito.',
  unsupported_type: 'Questo tipo di file non è supportato.',
  unavailable: 'Servizio non disponibile in questo momento.',
  internal: 'Qualcosa è andato storto. Riprova tra un attimo.',
};

export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly code: ApiErrorCode,
    message?: string,
  ) {
    super(message ?? MESSAGES[code]);
    this.status = STATUS[code];
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  console.error('Unhandled API error', error);
  return Response.json(
    { error: { code: 'internal', message: MESSAGES.internal } },
    { status: 500 },
  );
}
