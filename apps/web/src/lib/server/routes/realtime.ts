import { GENERAL_ROOM, TICKET_TTL_MS, projectRoom, signTicket } from '@kyon/core';
import { ApiError } from '../errors';
import { authedRoute, json } from '../http';
import { authorizeProject } from '../projects';

/**
 * GET /api/realtime/ticket?project=<id> (or ?room=general) → a 60-second ticket to open the
 * room's WebSocket. The permission check happens here, once per connection.
 */
export const GET = authedRoute(async ({ request, env, db, actor }) => {
  const url = new URL(request.url);
  const projectId = url.searchParams.get('project');
  const general = url.searchParams.get('room') === GENERAL_ROOM;
  if (!env.INTERNAL_SECRET) throw new ApiError('unavailable', 'Il tempo reale non è configurato.');
  if (!projectId && !general) throw new ApiError('bad_request');
  if (projectId) await authorizeProject(db, actor, projectId, 'project:view');
  const room = projectId ? projectRoom(projectId) : GENERAL_ROOM;
  const ticket = await signTicket(env.INTERNAL_SECRET, {
    userId: actor.id,
    room,
    exp: Date.now() + TICKET_TTL_MS,
  });
  const path = projectId ? `/ws/project/${projectId}` : '/ws/general';
  // Locally `next dev` can't upgrade WebSockets: the browser talks to the realtime Worker directly.
  return json({ url: `${env.REALTIME_URL ?? ''}${path}`, ticket });
});
