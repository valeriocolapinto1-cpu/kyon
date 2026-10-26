import type { RealtimeEnv } from './room';
import { routeToRoom } from './route';

export { ProjectRoom, GeneralRoom } from './room';

export default {
  async fetch(request: Request, env: RealtimeEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true });
    }
    return routeToRoom(request, env) ?? new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<RealtimeEnv>;
