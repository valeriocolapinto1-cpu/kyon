import { ROOM_HEADER } from '@kyon/core';

interface Namespaces {
  PROJECT_ROOM: DurableObjectNamespace;
  GENERAL_ROOM: DurableObjectNamespace;
}

/**
 * `/ws/project/<id>` and `/ws/general` → the right object, with the room name attached.
 * Shared by this Worker (direct connections in development) and the web Worker's entry point.
 */
export function routeToRoom(request: Request, env: Namespaces): Promise<Response> | null {
  const url = new URL(request.url);
  const match = /^\/ws\/(?:project\/([A-Za-z0-9-]{1,64})|(general))\/?(broadcast)?$/.exec(
    url.pathname,
  );
  if (!match) return null;
  const [, projectId, general, broadcast] = match;
  const room = general ? 'general' : `project:${projectId}`;
  const namespace = general ? env.GENERAL_ROOM : env.PROJECT_ROOM;
  const stub = namespace.get(namespace.idFromName(room));
  const headers = new Headers(request.headers);
  headers.set(ROOM_HEADER, room);
  const target = new URL(broadcast ? '/broadcast' : '/connect', url);
  target.search = url.search;
  return stub.fetch(new Request(target, { method: request.method, headers, body: request.body }));
}
