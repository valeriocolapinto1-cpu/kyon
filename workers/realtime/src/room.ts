import { DurableObject } from 'cloudflare:workers';

export interface RealtimeEnv {
  DB: D1Database;
  PROJECT_ROOM: DurableObjectNamespace<ProjectRoom>;
  GENERAL_ROOM: DurableObjectNamespace<GeneralRoom>;
}

/**
 * Base room using the WebSocket Hibernation API: the object can be evicted from memory
 * while sockets stay open, so idle rooms cost no duration.
 * Phase 0 only echoes a ping; auth, chat storage and D1 archiving arrive in Phase 7.
 */
abstract class Room extends DurableObject<RealtimeEnv> {
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (message === 'ping') {
      ws.send('pong');
    }
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
  }
}

export class ProjectRoom extends Room {}

export class GeneralRoom extends Room {}
