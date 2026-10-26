import { checkPassword } from '@kyon/core';
import { it } from '@/lib/i18n/it';

export function passwordError(password: string, confirm?: string): string | null {
  const problem = checkPassword(password);
  if (problem === 'too_short') return it.auth.passwordTooShort;
  if (problem === 'too_long') return it.auth.passwordTooLong;
  if (confirm !== undefined && password !== confirm) return it.auth.passwordMismatch;
  return null;
}

/** Only allow same-site relative paths after login (no open redirects). */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}
