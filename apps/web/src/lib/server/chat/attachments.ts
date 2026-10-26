import { eq } from 'drizzle-orm';
import { MAX_ATTACHMENT_BYTES, checkAttachment, type Actor } from '@kyon/core';
import type { Db } from '@/db/client';
import { attachment } from '@/db/schema';
import { ApiError } from '../errors';
import { roomAccess } from './rooms';

/**
 * Upload: the raw bytes are the request body (no multipart parsing: CPU stays tiny), stored in
 * R2 as they are. Images arrive already resized by the browser.
 */
export async function uploadAttachment(
  db: Db,
  env: CloudflareEnv,
  actor: Actor,
  roomId: string,
  request: Request,
  meta: { name: string; width: number | null; height: number | null; alt: string | null },
) {
  const access = await roomAccess(db, actor, roomId);
  if (!access.canWrite) throw new ApiError('forbidden');
  const size = Number(request.headers.get('content-length') ?? '0');
  if (size > MAX_ATTACHMENT_BYTES)
    throw new ApiError('too_large', 'Il file supera i 10 MB: comprimilo o dividilo.');
  const check = checkAttachment(meta.name, request.headers.get('content-type') ?? '', size);
  if (!check.ok)
    throw new ApiError(
      check.reason === 'too_large'
        ? 'too_large'
        : check.reason === 'empty'
          ? 'bad_request'
          : 'unsupported_type',
      check.reason === 'too_large' ? 'Il file supera i 10 MB: comprimilo o dividilo.' : undefined,
    );
  if (!env.FILES) throw new ApiError('unavailable');
  // Buffered (≤ 10 MB, copied, not parsed): the real size is checked before anything is stored.
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength !== size || bytes.byteLength > MAX_ATTACHMENT_BYTES)
    throw new ApiError('bad_request', 'Il caricamento non è completo. Riprova.');
  const id = crypto.randomUUID();
  const key = `chat/${roomId.replace(':', '/')}/${id}`;
  await env.FILES.put(key, bytes, { httpMetadata: { contentType: check.mime } });
  await db.insert(attachment).values({
    id,
    roomId,
    uploaderId: actor.id,
    key,
    name: check.name,
    mime: check.mime,
    size,
    width: check.image ? meta.width : null,
    height: check.image ? meta.height : null,
    alt: meta.alt?.slice(0, 300) || null,
  });
  return { id, name: check.name, mime: check.mime, size, image: check.image };
}

/** Download through the Worker only, after checking the room: never a public R2 URL. */
export async function downloadAttachment(db: Db, env: CloudflareEnv, actor: Actor, id: string) {
  const [row] = await db.select().from(attachment).where(eq(attachment.id, id)).limit(1);
  if (!row) throw new ApiError('not_found');
  await roomAccess(db, actor, row.roomId);
  // Not sent yet: only its uploader may see it.
  if (!row.messageId && row.uploaderId !== actor.id) throw new ApiError('not_found');
  const object = env.FILES ? await env.FILES.get(row.key) : null;
  if (!object) throw new ApiError('not_found');
  const inline = row.mime.startsWith('image/') || row.mime === 'application/pdf';
  const type = row.mime.startsWith('text/') ? `${row.mime}; charset=utf-8` : row.mime;
  return new Response(object.body, {
    headers: {
      'content-type': type,
      'content-length': String(object.size),
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      'x-content-type-options': 'nosniff',
      // Files never change (a new upload is a new id); only people with access get them.
      'cache-control': 'private, max-age=31536000, immutable',
      'content-security-policy':
        "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
