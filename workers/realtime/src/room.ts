import { DurableObject } from 'cloudflare:workers';
import { INTERNAL_HEADER, ROOM_HEADER, verifyTicket } from '@kyon/core';

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
 *   socket. Chat storage arrives in Fase 7.
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
        try {
          ws.send(body);
          sent++;
        } catch (error) {
          // A socket closing right now: it will be cleaned up by webSocketClose.
          console.warn('broadcast to closing socket', error);
        }
      }
      return Response.json({ sent });
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    const ticket = await verifyTicket(secret, url.searchParams.get('ticket') ?? '', room);
    if (!ticket) return new Response('Forbidden', { status: 403 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [ticket.userId]);
    pair[1].serializeAttachment({ userId: ticket.userId } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Clients only ping for now (keeps mobile networks from dropping idle sockets).
    if (message === 'ping') ws.send('pong');
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
  }
}

export class ProjectRoom extends Room {}

export class GeneralRoom extends Room {}
