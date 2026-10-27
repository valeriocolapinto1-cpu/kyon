import { DurableObject } from 'cloudflare:workers';
import { INTERNAL_HEADER, ROOM_HEADER, parseClientMessage, verifyTicket } from '@kyon/core';

export interface RealtimeEnv {
  DB: D1Database;
  PROJECT_ROOM: DurableObjectNamespace<ProjectRoom>;
  GENERAL_ROOM: DurableObjectNamespace<GeneralRoom>;
  /** Shared with the web Worker: signs tickets and authenticates broadcasts. */
  INTERNAL_SECRET?: string;
}

interface Attachment {
  userId: string;
}

/**
 * Base room using the WebSocket Hibernation API: the object can be evicted from memory while
 * sockets stay open, so idle rooms cost no duration.
 *
 * - `GET /connect?ticket=…` (WebSocket upgrade): the ticket is signed by the web Worker after
 *   the session and permission checks; here only the signature, room and expiry are verified.
 * - `POST /broadcast` (from the web Worker, with the internal secret): sends the body to every
 *   socket (chat messages are stored in D1 by the web Worker, rooms only fan out).
 * - Presence (who is connected) and "sta scrivendo" live only here, never stored.
 */
abstract class Room extends DurableObject<RealtimeEnv> {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const room = request.headers.get(ROOM_HEADER) ?? '';
    const secret = this.env.INTERNAL_SECRET ?? '';
    if (url.pathname.endsWith('/broadcast') && request.method === 'POST') {
      if (!secret || request.headers.get(INTERNAL_HEADER) !== secret)
        return new Response('Forbidden', { status: 403 });
      const body = await request.text();
      let sent = 0;
      for (const ws of this.ctx.getWebSockets()) {
        this.trySend(ws, body);
        sent++;
      }
      return Response.json({ sent });
    }
    // Who is connected right now (web Worker only): no push to someone already looking.
    if (url.pathname.endsWith('/presence') && request.method === 'GET') {
      if (!secret || request.headers.get(INTERNAL_HEADER) !== secret)
        return new Response('Forbidden', { status: 403 });
      return Response.json({ userIds: this.connectedUsers() });
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    const ticket = await verifyTicket(secret, url.searchParams.get('ticket') ?? '', room);
    if (!ticket) return new Response('Forbidden', { status: 403 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [ticket.userId]);
    pair[1].serializeAttachment({ userId: ticket.userId } satisfies Attachment);
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Keeps mobile networks from dropping idle sockets.
    if (message === 'ping') return ws.send('pong');
    if (typeof message !== 'string') return;
    const parsed = parseClientMessage(message);
    if (!parsed) return;
    // "sta scrivendo": relayed to the others, never stored. The user id comes from the ticket.
    const { userId } = ws.deserializeAttachment() as Attachment;
    const event = JSON.stringify({ type: 'typing', roomId: parsed.roomId, userId });
    for (const other of this.ctx.getWebSockets()) if (other !== ws) this.trySend(other, event);
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
    this.broadcastPresence(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.broadcastPresence(ws);
  }

  private trySend(ws: WebSocket, data: string) {
    try {
      ws.send(data);
    } catch (error) {
      // A socket closing right now: it will be cleaned up by webSocketClose.
      console.warn('send to closing socket', error);
    }
  }

  /** Who is connected (each user once), to everyone. `leaving` is excluded while it closes. */
  private connectedUsers(leaving?: WebSocket) {
    const sockets = this.ctx.getWebSockets().filter((ws) => ws !== leaving);
    return [
      ...new Set(sockets.map((ws) => (ws.deserializeAttachment() as Attachment | null)?.userId)),
    ].filter((id): id is string => Boolean(id));
  }

  private broadcastPresence(leaving?: WebSocket) {
    const sockets = this.ctx.getWebSockets().filter((ws) => ws !== leaving);
    const userIds = this.connectedUsers(leaving);
    const event = JSON.stringify({ type: 'presence', userIds });
    for (const ws of sockets) this.trySend(ws, event);
  }
}

export class ProjectRoom extends Room {}

export class GeneralRoom extends Room {}
