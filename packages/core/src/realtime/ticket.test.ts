import { describe, expect, it } from 'vitest';
import { signTicket, verifyTicket } from './ticket';

const secret = 'test-secret';
const ticket = { userId: 'u1', room: 'project:p1', exp: 2_000 };

describe('realtime tickets', () => {
  it('round-trips a valid ticket', async () => {
    const token = await signTicket(secret, ticket);
    expect(await verifyTicket(secret, token, 'project:p1', 1_000)).toEqual(ticket);
  });

  it('rejects another room, an expired ticket, a wrong secret', async () => {
    const token = await signTicket(secret, ticket);
    expect(await verifyTicket(secret, token, 'project:p2', 1_000)).toBeNull();
    expect(await verifyTicket(secret, token, 'project:p1', 2_001)).toBeNull();
    expect(await verifyTicket('other', token, 'project:p1', 1_000)).toBeNull();
    expect(await verifyTicket('', token, 'project:p1', 1_000)).toBeNull();
  });

  it('rejects tampering and garbage', async () => {
    const token = await signTicket(secret, ticket);
    const [, signature] = token.split('.');
    const forged = `${btoa(JSON.stringify({ ...ticket, userId: 'admin' })).replace(/=+$/, '')}.${signature}`;
    expect(await verifyTicket(secret, forged, 'project:p1', 1_000)).toBeNull();
    for (const bad of ['', 'a', 'a.b', 'a.b.c', '%%%.***', `${token}.x`])
      expect(await verifyTicket(secret, bad, 'project:p1', 1_000)).toBeNull();
  });
});
