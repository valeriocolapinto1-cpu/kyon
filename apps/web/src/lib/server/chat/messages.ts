import { and, asc, desc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import { findMentions, isEmoji, type Actor } from '@kyon/core';
import type { Db } from '@/db/client';
import { attachment, chatMessage, chatPin, chatReaction, chatRoom, user } from '@/db/schema';
import { chunk, inChunks } from '../d1';
import { ApiError } from '../errors';
import { avatarUrl } from '../users';
import { notifyChatMessage } from '../notifications/sources';
import { publishChat, roomAccess, roomPeople } from './rooms';

export const MAX_MESSAGE_LENGTH = 4000;
const PAGE = 50;

type MessageRow = typeof chatMessage.$inferSelect;

export interface MessageView {
  id: string;
  roomId: string;
  seq: number;
  clientId: string;
  author: { id: string; name: string; avatarUrl: string | null } | null;
  body: string;
  deleted: boolean;
  edited: boolean;
  createdAt: string;
  mentions: string[];
  replyTo: { id: string; author: string; excerpt: string; deleted: boolean } | null;
  reactions: { emoji: string; count: number; mine: boolean; names: string[]; userIds: string[] }[];
  attachments: {
    id: string;
    name: string;
    mime: string;
    size: number;
    width: number | null;
    height: number | null;
    alt: string | null;
    url: string;
  }[];
  pinned: boolean;
}

/** Messages with their author, reply preview, reactions, attachments and pin state. */
async function views(db: Db, actor: Actor, rows: MessageRow[]): Promise<MessageView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.authorId).filter((x): x is string => !!x))];
  const replyIds = [...new Set(rows.map((r) => r.replyToId).filter((x): x is string => !!x))];
  const [authors, reactions, files, pins, replies] = await Promise.all([
    inChunks(authorIds, (slice) =>
      db
        .select({ id: user.id, name: user.name, avatarKey: user.avatarKey })
        .from(user)
        .where(inArray(user.id, slice)),
    ),
    inChunks(ids, (slice) =>
      db
        .select({
          messageId: chatReaction.messageId,
          emoji: chatReaction.emoji,
          userId: chatReaction.userId,
          name: user.name,
        })
        .from(chatReaction)
        .innerJoin(user, eq(user.id, chatReaction.userId))
        .where(inArray(chatReaction.messageId, slice))
        .orderBy(asc(chatReaction.createdAt)),
    ),
    inChunks(ids, (slice) =>
      db.select().from(attachment).where(inArray(attachment.messageId, slice)),
    ),
    inChunks(ids, (slice) =>
      db
        .select({ messageId: chatPin.messageId })
        .from(chatPin)
        .where(inArray(chatPin.messageId, slice)),
    ),
    inChunks(replyIds, (slice) =>
      db
        .select({
          id: chatMessage.id,
          body: chatMessage.body,
          deletedAt: chatMessage.deletedAt,
          author: user.name,
        })
        .from(chatMessage)
        .leftJoin(user, eq(user.id, chatMessage.authorId))
        .where(inArray(chatMessage.id, slice)),
    ),
  ]);
  const authorById = new Map(authors.map((a) => [a.id, a]));
  const pinned = new Set(pins.map((p) => p.messageId));
  return rows.map((row) => {
    const author = row.authorId ? authorById.get(row.authorId) : undefined;
    const grouped = new Map<string, MessageView['reactions'][number]>();
    for (const r of reactions.filter((x) => x.messageId === row.id)) {
      const entry = grouped.get(r.emoji) ?? {
        emoji: r.emoji,
        count: 0,
        mine: false,
        names: [],
        userIds: [],
      };
      entry.count++;
      entry.mine ||= r.userId === actor.id;
      entry.names.push(r.name);
      entry.userIds.push(r.userId);
      grouped.set(r.emoji, entry);
    }
    const reply = row.replyToId ? replies.find((x) => x.id === row.replyToId) : undefined;
    const deleted = Boolean(row.deletedAt);
    return {
      id: row.id,
      roomId: row.roomId,
      seq: row.seq,
      clientId: row.clientId,
      author: author
        ? { id: author.id, name: author.name, avatarUrl: avatarUrl(author.id, author.avatarKey) }
        : null,
      body: deleted ? '' : row.body,
      deleted,
      edited: Boolean(row.editedAt) && !deleted,
      createdAt: row.createdAt.toISOString(),
      mentions: deleted ? [] : (JSON.parse(row.mentions) as string[]),
      replyTo: reply
        ? {
            id: reply.id,
            author: reply.author ?? '',
            excerpt: reply.deletedAt ? '' : reply.body.slice(0, 120),
            deleted: Boolean(reply.deletedAt),
          }
        : null,
      reactions: deleted ? [] : [...grouped.values()],
      attachments: deleted
        ? []
        : files
            .filter((f) => f.messageId === row.id)
            .map((f) => ({
              id: f.id,
              name: f.name,
              mime: f.mime,
              size: f.size,
              width: f.width,
              height: f.height,
              alt: f.alt,
              url: `/api/files/chat/${f.id}`,
            })),
      pinned: pinned.has(row.id),
    };
  });
}

/**
 * A page of messages, oldest first: the latest 50, or the 50 before `before`, or everything after
 * `after` (catching up after a reconnection, up to 200).
 */
export async function listMessages(
  db: Db,
  actor: Actor,
  roomId: string,
  cursor: { before?: number; after?: number },
) {
  const access = await roomAccess(db, actor, roomId);
  let rows: MessageRow[];
  if (cursor.after !== undefined) {
    rows = await db
      .select()
      .from(chatMessage)
      .where(and(eq(chatMessage.roomId, roomId), gt(chatMessage.seq, cursor.after)))
      .orderBy(asc(chatMessage.seq))
      .limit(200);
  } else {
    rows = (
      await db
        .select()
        .from(chatMessage)
        .where(
          and(
            eq(chatMessage.roomId, roomId),
            cursor.before !== undefined ? lt(chatMessage.seq, cursor.before) : undefined,
          ),
        )
        .orderBy(desc(chatMessage.seq))
        .limit(PAGE + 1)
    ).reverse();
  }
  const hasMore = cursor.after === undefined && rows.length > PAGE;
  if (hasMore) rows = rows.slice(1);
  const people = await roomPeople(db, access);
  return {
    room: {
      id: access.room.id,
      kind: access.room.kind,
      projectId: access.room.projectId,
      taskId: access.room.taskId,
      title: access.room.title,
      lastSeq: access.room.lastSeq,
    },
    canWrite: access.canWrite,
    canModerate: access.canModerate,
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      avatarUrl: avatarUrl(p.id, p.avatarKey),
    })),
    messages: await views(db, actor, rows),
    hasMore,
  };
}

async function loadMessage(db: Db, messageId: string) {
  const [row] = await db.select().from(chatMessage).where(eq(chatMessage.id, messageId)).limit(1);
  if (!row) throw new ApiError('not_found');
  return row;
}

async function viewOne(db: Db, actor: Actor, messageId: string) {
  const [view] = await views(db, actor, [await loadMessage(db, messageId)]);
  if (!view) throw new ApiError('not_found');
  return view;
}

/** Broadcasts carry the message as a neutral view (no `mine` flags of the sender). */
const neutral = (view: MessageView): MessageView => ({
  ...view,
  reactions: view.reactions.map((r) => ({ ...r, mine: false })),
});

export async function sendMessage(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  roomId: string,
  input: {
    clientId: string;
    body: string;
    replyToId: string | null;
    attachmentIds: string[];
    /** Alt texts typed while the files were uploading. */
    alts?: Record<string, string>;
  },
) {
  const access = await roomAccess(db, actor, roomId);
  if (!access.canWrite) throw new ApiError('forbidden');
  const body = input.body.trim();
  if (!body && !input.attachmentIds.length)
    throw new ApiError('bad_request', 'Il messaggio è vuoto.');

  // Retry of a message already stored (lost response, reconnection): same answer, no duplicate.
  const [existing] = await db
    .select({ id: chatMessage.id })
    .from(chatMessage)
    .where(and(eq(chatMessage.roomId, roomId), eq(chatMessage.clientId, input.clientId)))
    .limit(1);
  if (existing) return viewOne(db, actor, existing.id);

  if (input.replyToId) {
    const reply = await loadMessage(db, input.replyToId);
    if (reply.roomId !== roomId) throw new ApiError('bad_request');
  }
  const files = input.attachmentIds.length
    ? await db
        .select()
        .from(attachment)
        .where(and(inArray(attachment.id, input.attachmentIds), isNull(attachment.messageId)))
    : [];
  if (
    files.length !== input.attachmentIds.length ||
    files.some((f) => f.roomId !== roomId || f.uploaderId !== actor.id)
  )
    throw new ApiError('bad_request', 'Allegato non valido.');

  const people = await roomPeople(db, access);
  const mentions = findMentions(
    body,
    people.filter((p) => p.id !== actor.id),
  );
  const id = crypto.randomUUID();
  const now = new Date();
  // The room's counter decides the order: one atomic statement reserves the next number, even
  // with concurrent senders. A failed insert just leaves a gap (harmless: readers use "after").
  const [reserved] = await db
    .update(chatRoom)
    .set({ lastSeq: sql`${chatRoom.lastSeq} + 1`, lastMessageAt: now })
    .where(eq(chatRoom.id, roomId))
    .returning({ seq: chatRoom.lastSeq });
  if (!reserved) throw new ApiError('not_found');
  try {
    await db.insert(chatMessage).values({
      id,
      roomId,
      seq: reserved.seq,
      clientId: input.clientId,
      authorId: actor.id,
      body,
      replyToId: input.replyToId,
      mentions: JSON.stringify(mentions),
      createdAt: now,
    });
  } catch (error) {
    // The same client id raced in from another request: answer with the stored one.
    const [stored] = await db
      .select({ id: chatMessage.id })
      .from(chatMessage)
      .where(and(eq(chatMessage.roomId, roomId), eq(chatMessage.clientId, input.clientId)))
      .limit(1);
    if (stored) return viewOne(db, actor, stored.id);
    throw error;
  }
  for (const slice of chunk(
    files.map((f) => f.id),
    90,
  ))
    await db.update(attachment).set({ messageId: id }).where(inArray(attachment.id, slice));
  for (const [fileId, alt] of Object.entries(input.alts ?? {}))
    if (files.some((f) => f.id === fileId) && alt.trim())
      await db
        .update(attachment)
        .set({ alt: alt.trim().slice(0, 300) })
        .where(eq(attachment.id, fileId));
  const view = await viewOne(db, actor, id);
  await publishChat(env, access.room, {
    action: 'message',
    actorId: actor.id,
    message: neutral(view),
  });
  try {
    await notifyChatMessage(db, env, actor, access, {
      body,
      mentions,
      hasAttachments: files.length > 0,
    });
  } catch (error) {
    // The message is stored: a notification problem must not turn it into an error.
    console.warn('Chat notifications failed', error);
  }
  return view;
}

async function ownMessage(db: Db, actor: Actor, messageId: string) {
  const row = await loadMessage(db, messageId);
  const access = await roomAccess(db, actor, row.roomId);
  if (row.authorId !== actor.id || row.deletedAt) throw new ApiError('forbidden');
  return { row, access };
}

export async function editMessage(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  messageId: string,
  body: string,
) {
  const { row, access } = await ownMessage(db, actor, messageId);
  const text = body.trim();
  if (!text) throw new ApiError('bad_request', 'Il messaggio è vuoto.');
  if (text === row.body) return viewOne(db, actor, messageId);
  const people = await roomPeople(db, access);
  const mentions = findMentions(
    text,
    people.filter((p) => p.id !== actor.id),
  );
  await db
    .update(chatMessage)
    .set({ body: text, mentions: JSON.stringify(mentions), editedAt: new Date() })
    .where(eq(chatMessage.id, messageId));
  const view = await viewOne(db, actor, messageId);
  await publishChat(env, access.room, {
    action: 'edit',
    actorId: actor.id,
    message: neutral(view),
  });
  return view;
}

/** Soft delete: the text goes (out of search too), the place in the conversation stays. */
export async function deleteMessage(db: Db, env: CloudflareEnv, actor: Actor, messageId: string) {
  const { access } = await ownMessage(db, actor, messageId);
  const files = await db.select().from(attachment).where(eq(attachment.messageId, messageId));
  await db.batch([
    db
      .update(chatMessage)
      .set({ body: '', mentions: '[]', deletedAt: new Date() })
      .where(eq(chatMessage.id, messageId)),
    db.delete(chatReaction).where(eq(chatReaction.messageId, messageId)),
    db.delete(chatPin).where(eq(chatPin.messageId, messageId)),
    db.delete(attachment).where(eq(attachment.messageId, messageId)),
  ]);
  if (files.length && env.FILES) await env.FILES.delete(files.map((f) => f.key));
  const view = await viewOne(db, actor, messageId);
  await publishChat(env, access.room, {
    action: 'delete',
    actorId: actor.id,
    message: neutral(view),
  });
  return view;
}

/** Adds or removes the actor's reaction (toggle). */
export async function toggleReaction(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  messageId: string,
  emoji: string,
) {
  if (!isEmoji(emoji)) throw new ApiError('bad_request', 'Reazione non valida.');
  const row = await loadMessage(db, messageId);
  const access = await roomAccess(db, actor, row.roomId);
  if (!access.canWrite || row.deletedAt) throw new ApiError('forbidden');
  const removed = await db
    .delete(chatReaction)
    .where(
      and(
        eq(chatReaction.messageId, messageId),
        eq(chatReaction.userId, actor.id),
        eq(chatReaction.emoji, emoji),
      ),
    )
    .returning({ emoji: chatReaction.emoji });
  if (!removed.length) {
    const existing = await db
      .select({ emoji: chatReaction.emoji })
      .from(chatReaction)
      .where(eq(chatReaction.messageId, messageId));
    if (new Set([...existing.map((e) => e.emoji), emoji]).size > 20)
      throw new ApiError('bad_request', 'Troppe reazioni diverse su questo messaggio.');
    await db
      .insert(chatReaction)
      .values({ messageId, userId: actor.id, emoji })
      .onConflictDoNothing();
  }
  const view = await viewOne(db, actor, messageId);
  await publishChat(env, access.room, {
    action: 'reaction',
    actorId: actor.id,
    message: neutral(view),
  });
  return view;
}

export async function setPinned(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  messageId: string,
  pinned: boolean,
) {
  const row = await loadMessage(db, messageId);
  const access = await roomAccess(db, actor, row.roomId);
  if (!access.canModerate || row.deletedAt) throw new ApiError('forbidden');
  if (pinned)
    await db
      .insert(chatPin)
      .values({ roomId: row.roomId, messageId, pinnedBy: actor.id })
      .onConflictDoNothing();
  else await db.delete(chatPin).where(eq(chatPin.messageId, messageId));
  const view = await viewOne(db, actor, messageId);
  await publishChat(env, access.room, { action: 'pin', actorId: actor.id, message: neutral(view) });
  return view;
}

export async function listPins(db: Db, actor: Actor, roomId: string) {
  await roomAccess(db, actor, roomId);
  const rows = await db
    .select({ message: chatMessage })
    .from(chatPin)
    .innerJoin(chatMessage, eq(chatMessage.id, chatPin.messageId))
    .where(eq(chatPin.roomId, roomId))
    .orderBy(desc(chatPin.createdAt));
  return views(
    db,
    actor,
    rows.map((r) => r.message),
  );
}

/** FTS5 terms from what the user typed: words as prefixes, everything quoted (no syntax injection). */
export function ftsQuery(input: string): string | null {
  const words = input
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1)
    .slice(0, 8);
  return words.length ? words.map((w) => `"${w}"*`).join(' ') : null;
}

/** Search in every room the actor can read (or one), newest first. */
export async function searchMessages(db: Db, actor: Actor, query: string, roomIds: string[]) {
  const match = ftsQuery(query);
  if (!match || !roomIds.length) return [];
  const rows = await inChunks(roomIds, (slice) =>
    db
      .select({ message: chatMessage })
      .from(chatMessage)
      .where(
        and(
          inArray(chatMessage.roomId, slice),
          isNull(chatMessage.deletedAt),
          sql`${chatMessage}.rowid IN (SELECT rowid FROM chat_message_fts WHERE chat_message_fts MATCH ${match})`,
        ),
      )
      .orderBy(desc(chatMessage.createdAt))
      .limit(30),
  );
  const found = await views(
    db,
    actor,
    rows
      .map((r) => r.message)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 30),
  );
  // Where each result lives (task comments open in the task, not in Chat).
  const rooms = await inChunks([...new Set(found.map((m) => m.roomId))], (slice) =>
    db
      .select({ id: chatRoom.id, projectId: chatRoom.projectId, taskId: chatRoom.taskId })
      .from(chatRoom)
      .where(inArray(chatRoom.id, slice)),
  );
  const byId = new Map(rooms.map((r) => [r.id, r]));
  return found.map((m) => ({
    ...m,
    projectId: byId.get(m.roomId)?.projectId ?? null,
    taskId: byId.get(m.roomId)?.taskId ?? null,
  }));
}
