import type { RealtimeEnv } from './room';

export { ProjectRoom, GeneralRoom } from './room';

export default {
  async fetch(request: Request, env: RealtimeEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true });
    }
    if (url.pathname === '/general') {
      const stub = env.GENERAL_ROOM.get(env.GENERAL_ROOM.idFromName('general'));
      return stub.fetch(request);
    }
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<RealtimeEnv>;
