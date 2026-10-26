import { z } from 'zod';
import { ApiError } from '../errors';
import { authedRoute, json, parseJson, rateLimit } from '../http';
import { downloadAttachment, uploadAttachment } from '../chat/attachments';
import {
  MAX_MESSAGE_LENGTH,
  deleteMessage,
  editMessage,
  listMessages,
  listPins,
  searchMessages,
  sendMessage,
  setPinned,
  toggleReaction,
} from '../chat/messages';
import { linkPreview } from '../chat/previews';
import {
  createThread,
  listRooms,
  markRead,
  renameThread,
  roomAccess,
  setMuted,
} from '../chat/rooms';

type RoomParams = { roomId: string };
type MessageParams = { messageId: string };

const seq = z.coerce.number().int().min(0).max(1e12);

/** GET /api/chat/rooms */
export const rooms = authedRoute(async ({ db, actor }) =>
  json({ rooms: await listRooms(db, actor) }),
);

/** GET /api/chat/rooms/:roomId/messages?before=&after= */
export const messages = authedRoute<RoomParams>(async ({ request, db, actor }, { roomId }) => {
  const url = new URL(request.url);
  const before = url.searchParams.get('before');
  const after = url.searchParams.get('after');
  return json(
    await listMessages(db, actor, roomId, {
      before: before !== null ? seq.parse(before) : undefined,
      after: after !== null ? seq.parse(after) : undefined,
    }),
  );
});

const Send = z.object({
  clientId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  body: z.string().max(MAX_MESSAGE_LENGTH),
  replyToId: z.string().max(64).nullable().default(null),
  attachmentIds: z.array(z.string().max(64)).max(10).default([]),
});

/** POST /api/chat/rooms/:roomId/messages (idempotent on clientId) */
export const send = authedRoute<RoomParams>(async ({ request, env, db, actor }, { roomId }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  return json(await sendMessage(db, env, actor, roomId, await parseJson(request, Send)), {
    status: 201,
  });
});

/** PATCH /api/chat/messages/:messageId { body } · DELETE */
export const message = {
  PATCH: authedRoute<MessageParams>(async ({ request, env, db, actor }, { messageId }) => {
    await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
    const { body } = await parseJson(
      request,
      z.object({ body: z.string().max(MAX_MESSAGE_LENGTH) }),
    );
    return json(await editMessage(db, env, actor, messageId, body));
  }),
  DELETE: authedRoute<MessageParams>(async ({ env, db, actor }, { messageId }) => {
    await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
    return json(await deleteMessage(db, env, actor, messageId));
  }),
};

/** POST /api/chat/messages/:messageId/reactions { emoji } (toggle) */
export const reaction = authedRoute<MessageParams>(
  async ({ request, env, db, actor }, { messageId }) => {
    await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
    const { emoji } = await parseJson(request, z.object({ emoji: z.string().max(32) }));
    return json(await toggleReaction(db, env, actor, messageId, emoji));
  },
);

/** PUT|DELETE /api/chat/messages/:messageId/pin */
export const pin = {
  PUT: authedRoute<MessageParams>(async ({ env, db, actor }, { messageId }) =>
    json(await setPinned(db, env, actor, messageId, true)),
  ),
  DELETE: authedRoute<MessageParams>(async ({ env, db, actor }, { messageId }) =>
    json(await setPinned(db, env, actor, messageId, false)),
  ),
};

/** GET /api/chat/rooms/:roomId/pins */
export const pins = authedRoute<RoomParams>(async ({ db, actor }, { roomId }) =>
  json({ messages: await listPins(db, actor, roomId) }),
);

/** POST /api/chat/rooms/:roomId/read { seq } */
export const read = authedRoute<RoomParams>(async ({ request, db, actor }, { roomId }) => {
  const body = await parseJson(request, z.object({ seq }));
  await markRead(db, actor, roomId, body.seq);
  return json({ ok: true });
});

/** PUT|DELETE /api/chat/rooms/:roomId/mute */
export const mute = {
  PUT: authedRoute<RoomParams>(async ({ db, actor }, { roomId }) => {
    await setMuted(db, actor, roomId, true);
    return json({ muted: true });
  }),
  DELETE: authedRoute<RoomParams>(async ({ db, actor }, { roomId }) => {
    await setMuted(db, actor, roomId, false);
    return json({ muted: false });
  }),
};

const Title = z.string().trim().min(1).max(80);

/** POST /api/projects/:id/threads { title } */
export const threads = authedRoute<{ id: string }>(async ({ request, env, db, actor }, { id }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  const { title } = await parseJson(request, z.object({ title: Title }));
  return json(await createThread(db, env, actor, id, title), { status: 201 });
});

/** PATCH /api/chat/rooms/:roomId { title } (discussions only) */
export const room = authedRoute<RoomParams>(async ({ request, env, db, actor }, { roomId }) => {
  const { title } = await parseJson(request, z.object({ title: Title }));
  await renameThread(db, env, actor, roomId, title);
  return json({ ok: true });
});

/** GET /api/chat/search?q=&room= */
export const search = authedRoute(async ({ request, db, actor }) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').slice(0, 200);
  const roomId = url.searchParams.get('room');
  let roomIds: string[];
  if (roomId) {
    await roomAccess(db, actor, roomId);
    roomIds = [roomId];
  } else {
    roomIds = (await listRooms(db, actor)).map((r) => r.id);
  }
  return json({ messages: await searchMessages(db, actor, q, roomIds) });
});

/** PUT /api/chat/rooms/:roomId/attachments?name=&width=&height=&alt= (raw body) */
export const upload = authedRoute<RoomParams>(async ({ request, env, db, actor }, { roomId }) => {
  await rateLimit(env.WRITE_LIMITER, `write:${actor.id}`);
  const url = new URL(request.url);
  const num = (key: string) => {
    const value = Number(url.searchParams.get(key));
    return Number.isInteger(value) && value > 0 && value < 100_000 ? value : null;
  };
  const name = url.searchParams.get('name');
  if (!name) throw new ApiError('bad_request');
  return json(
    await uploadAttachment(db, env, actor, roomId, request, {
      name,
      width: num('width'),
      height: num('height'),
      alt: url.searchParams.get('alt'),
    }),
    { status: 201 },
  );
});

/** GET /api/files/chat/:id */
export const file = authedRoute<{ id: string }>(async ({ env, db, actor }, { id }) =>
  downloadAttachment(db, env, actor, id),
);

/** GET /api/chat/preview?url= */
export const preview = authedRoute(async ({ request, env, db, actor }) => {
  const url = new URL(request.url);
  const target = url.searchParams.get('url') ?? '';
  return json({ preview: await linkPreview(db, env, actor, target, url.origin) });
});
