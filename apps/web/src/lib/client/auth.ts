import { deriveClientKey, normalizeEmail } from '@kyon/core';
import { api } from './api';

/**
 * All password handling happens here: the password is stretched in the browser
 * (PBKDF2, 600 000 iterations) and only the derived key leaves the device.
 */

export async function signIn(email: string, password: string) {
  const key = await deriveClientKey(email, password);
  return api('/api/auth/sign-in/email', {
    method: 'POST',
    json: { email: normalizeEmail(email), password: key },
  });
}

export async function join(code: string, name: string, email: string, password: string) {
  const key = await deriveClientKey(email, password);
  return api<{ ok: true }>('/api/join', {
    method: 'POST',
    json: { code, name, email: normalizeEmail(email), key },
  });
}

export function checkInvite(code: string) {
  return api<{ valid: boolean; bootstrap: boolean }>(`/api/join?code=${encodeURIComponent(code)}`);
}

export function signOut() {
  return api('/api/auth/sign-out', { method: 'POST', json: {} });
}

export async function resetPassword(token: string, email: string, password: string) {
  const key = await deriveClientKey(email, password);
  return api('/api/auth/reset-password', { method: 'POST', json: { token, newPassword: key } });
}

export async function changePassword(email: string, current: string, next: string) {
  const [currentPassword, newPassword] = await Promise.all([
    deriveClientKey(email, current),
    deriveClientKey(email, next),
  ]);
  // Changing the password logs out every other device.
  return api('/api/auth/change-password', {
    method: 'POST',
    json: { currentPassword, newPassword, revokeOtherSessions: true },
  });
}

export async function changeEmail(currentEmail: string, newEmail: string, password: string) {
  const [currentKey, newKey] = await Promise.all([
    deriveClientKey(currentEmail, password),
    deriveClientKey(newEmail, password),
  ]);
  return api('/api/me/email', {
    method: 'POST',
    json: { currentKey, newEmail: normalizeEmail(newEmail), newKey },
  });
}

export interface DeviceSession {
  id: string;
  token: string;
  createdAt: string;
  updatedAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export function listSessions() {
  return api<DeviceSession[]>('/api/auth/list-sessions');
}

export function revokeSession(token: string) {
  return api('/api/auth/revoke-session', { method: 'POST', json: { token } });
}

export function revokeOtherSessions() {
  return api('/api/auth/revoke-other-sessions', { method: 'POST', json: {} });
}

export function currentSession() {
  return api<{ session: { token: string } } | null>('/api/auth/get-session');
}

/** Weekly token rotation; cheap no-op otherwise. Called once per app start. */
export function rotateSession() {
  return api<{ rotated: boolean }>('/api/auth/rotate-session', { method: 'POST', json: {} });
}
