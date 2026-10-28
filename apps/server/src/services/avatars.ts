import { createHash } from 'node:crypto';
import { AVATAR_RULES } from '@casino/shared';
import { sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/client';
import { fail } from '../errors';
import { assetUrl } from './assets';
import { audit } from './audit';

type AvatarMime = (typeof AVATAR_RULES.mime)[number];
const ascii = (b: Buffer, start: number, len: number) => b.toString('latin1', start, start + len);

/**
 * Profile photo checks, on the bytes only (the file name and declared type are never trusted):
 * JPEG, PNG or WebP, exactly 512×512, not animated, with a well-formed container. Every metadata
 * block (EXIF incl. GPS, XMP, ICC, comments, text chunks) is removed before storing; only what is
 * needed to draw the picture is kept. SVG, GIF and anything else are refused.
 */
export function sanitizeAvatar(input: Buffer): { bytes: Buffer; mime: AvatarMime; ext: 'jpg' | 'png' | 'webp' } {
  if (input.length < 32 || input.length > AVATAR_RULES.maxUploadBytes) throw fail('invalid_asset', 'file size');
  if (input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return { bytes: cleanJpeg(input), mime: 'image/jpeg', ext: 'jpg' };
  if (input.readUInt32BE(0) === 0x89504e47 && input.readUInt32BE(4) === 0x0d0a1a0a) return { bytes: cleanPng(input), mime: 'image/png', ext: 'png' };
  if (ascii(input, 0, 4) === 'RIFF' && ascii(input, 8, 4) === 'WEBP') return { bytes: cleanWebp(input), mime: 'image/webp', ext: 'webp' };
  throw fail('invalid_asset', 'only JPEG, PNG or WebP');
}

function assertSide(width: number, height: number) {
  if (width !== AVATAR_RULES.side || height !== AVATAR_RULES.side) throw fail('invalid_asset', `image must be ${AVATAR_RULES.side}×${AVATAR_RULES.side}`);
}

/** Keeps SOI, APP0 (JFIF), tables, frame and scan data; drops APP1–APP15 (EXIF, XMP, ICC…) and comments. */
function cleanJpeg(b: Buffer): Buffer {
  const out: Buffer[] = [b.subarray(0, 2)];
  let i = 2;
  let size: { w: number; h: number } | null = null;
  while (i < b.length) {
    if (b[i] !== 0xff) throw fail('invalid_asset', 'corrupt JPEG');
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd9) break; // EOI before any scan
    if (i + 4 > b.length) throw fail('invalid_asset', 'corrupt JPEG');
    const len = b.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > b.length) throw fail('invalid_asset', 'corrupt JPEG');
    const seg = b.subarray(i, i + 2 + len);
    // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC): height, width.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) size = { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    const metadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!metadata) out.push(seg);
    i += 2 + len;
    if (marker === 0xda) {
      // Start of scan: the rest is entropy-coded data up to EOI. Anything after EOI is dropped.
      const end = b.lastIndexOf(Buffer.from([0xff, 0xd9]));
      if (end < i) throw fail('invalid_asset', 'corrupt JPEG');
      out.push(b.subarray(i, end + 2));
      if (!size) throw fail('invalid_asset', 'corrupt JPEG');
      assertSide(size.w, size.h);
      return Buffer.concat(out);
    }
  }
  throw fail('invalid_asset', 'corrupt JPEG');
}

/** Keeps only the chunks needed to draw the image; refuses animated PNG. */
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'sBIT']);
function cleanPng(b: Buffer): Buffer {
  const out: Buffer[] = [b.subarray(0, 8)];
  let i = 8;
  let sawEnd = false;
  let first = true;
  while (i + 12 <= b.length) {
    const len = b.readUInt32BE(i);
    const type = ascii(b, i + 4, 4);
    if (!/^[A-Za-z]{4}$/.test(type) || i + 12 + len > b.length) throw fail('invalid_asset', 'corrupt PNG');
    if (first) {
      if (type !== 'IHDR' || len !== 13) throw fail('invalid_asset', 'corrupt PNG');
      assertSide(b.readUInt32BE(i + 8), b.readUInt32BE(i + 12));
      first = false;
    }
    if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') throw fail('invalid_asset', 'animated images are not allowed');
    if (PNG_KEEP.has(type)) out.push(b.subarray(i, i + 12 + len));
    i += 12 + len;
    if (type === 'IEND') {
      sawEnd = true;
      break;
    }
  }
  if (!sawEnd || first) throw fail('invalid_asset', 'corrupt PNG');
  return Buffer.concat(out);
}

/** Simple WebP (VP8/VP8L) is kept; extended WebP keeps only image chunks and its flags are rewritten. */
function cleanWebp(b: Buffer): Buffer {
  const riffEnd = Math.min(b.length, 8 + b.readUInt32LE(4));
  const chunks: { type: string; data: Buffer }[] = [];
  let i = 12;
  while (i + 8 <= riffEnd) {
    const type = ascii(b, i, 4);
    const len = b.readUInt32LE(i + 4);
    if (i + 8 + len > riffEnd) throw fail('invalid_asset', 'corrupt WebP');
    chunks.push({ type, data: b.subarray(i + 8, i + 8 + len) });
    i += 8 + len + (len % 2);
  }
  if (!chunks.length) throw fail('invalid_asset', 'corrupt WebP');
  if (chunks.some((c) => c.type === 'ANIM' || c.type === 'ANMF')) throw fail('invalid_asset', 'animated images are not allowed');
  const image = chunks.find((c) => c.type === 'VP8 ' || c.type === 'VP8L');
  if (!image) throw fail('invalid_asset', 'corrupt WebP');
  if (image.type === 'VP8 ') {
    if (image.data.length < 10 || image.data[3] !== 0x9d || image.data[4] !== 0x01 || image.data[5] !== 0x2a) throw fail('invalid_asset', 'corrupt WebP');
    assertSide(image.data.readUInt16LE(6) & 0x3fff, image.data.readUInt16LE(8) & 0x3fff);
  } else {
    const d = image.data;
    if (d.length < 5 || d[0] !== 0x2f) throw fail('invalid_asset', 'corrupt WebP');
    assertSide(1 + (((d[2]! & 0x3f) << 8) | d[1]!), 1 + (((d[4]! & 0x0f) << 10) | (d[3]! << 2) | ((d[2]! & 0xc0) >> 6)));
  }
  const keep: { type: string; data: Buffer }[] = [];
  const vp8x = chunks.find((c) => c.type === 'VP8X');
  const alph = chunks.find((c) => c.type === 'ALPH');
  if (vp8x) {
    const header = Buffer.from(vp8x.data);
    // Clear ICC (0x20), EXIF (0x08), XMP (0x04) and animation (0x02); keep alpha (0x10) only if present.
    header[0] = alph ? 0x10 : 0;
    keep.push({ type: 'VP8X', data: header });
    if (alph) keep.push(alph);
  }
  keep.push(image);
  const body = Buffer.concat(
    keep.map((c) => {
      const head = Buffer.alloc(8);
      head.write(c.type, 0, 'latin1');
      head.writeUInt32LE(c.data.length, 4);
      return Buffer.concat([head, c.data, c.data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
    }),
  );
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 'latin1');
  riff.writeUInt32LE(4 + body.length, 4);
  riff.write('WEBP', 8, 'latin1');
  return Buffer.concat([riff, body]);
}

/** The photo a player shows now, if any. */
export async function activeAvatar(db: DbOrTx, userId: string): Promise<string | null> {
  const [r] = await db.execute<{ asset_id: string | null }>(sql`SELECT asset_id FROM avatar_uploads WHERE user_id = ${userId}::uuid AND status = 'active'`);
  return r?.asset_id ? assetUrl(r.asset_id) : null;
}

/** Validates, cleans and stores a new photo, replacing the current one. Rate limited per player. */
export async function uploadAvatar(db: Db, userId: string, raw: Buffer): Promise<{ url: string }> {
  const clean = sanitizeAvatar(raw);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`);
    const [c] = await tx.execute<{ hour: number; day: number }>(sql`
      SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS hour, count(*)::int AS day
      FROM avatar_uploads WHERE user_id = ${userId}::uuid AND created_at > now() - interval '1 day'`);
    if (c!.hour >= AVATAR_RULES.perHour || c!.day >= AVATAR_RULES.perDay) throw fail('avatar_rate_limited');
    // Content-addressed: the stored name comes from the cleaned bytes, never from the upload's name.
    const id = `${createHash('sha256').update(clean.bytes).digest('hex')}.${clean.ext}`;
    await tx.execute(sql`
      INSERT INTO assets (id, mime, bytes, width, height, size, animated, created_by)
      VALUES (${id}, ${clean.mime}, ${clean.bytes}, ${AVATAR_RULES.side}, ${AVATAR_RULES.side}, ${clean.bytes.length}, false, ${userId}::uuid)
      ON CONFLICT (id) DO NOTHING`);
    await tx.execute(sql`UPDATE avatar_uploads SET status = 'replaced', ended_at = now() WHERE user_id = ${userId}::uuid AND status = 'active'`);
    await tx.execute(sql`INSERT INTO avatar_uploads (user_id, asset_id, mime, size) VALUES (${userId}::uuid, ${id}, ${clean.mime}, ${clean.bytes.length})`);
    return { url: assetUrl(id) };
  });
}

/** Back to the equipped avatar (frame and cosmetics are untouched). */
export async function removeAvatar(db: Db, userId: string): Promise<boolean> {
  const r = await db.execute(sql`UPDATE avatar_uploads SET status = 'removed', ended_at = now() WHERE user_id = ${userId}::uuid AND status = 'active' RETURNING id`);
  return r.length > 0;
}

/**
 * Staff remove an inappropriate photo. The player falls back to the equipped avatar; the image
 * bytes are deleted when nothing else uses them. Audited.
 */
export async function rejectAvatar(db: Db, actorId: string, target: { id: string; uid: number }, reason: string, ip?: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx.execute<{ id: string; asset_id: string | null }>(sql`
      UPDATE avatar_uploads SET status = 'rejected', ended_at = now(), moderated_by = ${actorId}::uuid, moderation_reason = ${reason}
      WHERE user_id = ${target.id}::uuid AND status = 'active' RETURNING id, asset_id`);
    if (!row) return false;
    if (row.asset_id) {
      await tx.execute(sql`
        DELETE FROM assets a WHERE a.id = ${row.asset_id}
          AND NOT EXISTS (SELECT 1 FROM avatar_uploads x WHERE x.asset_id = a.id AND x.status = 'active')
          AND NOT EXISTS (SELECT 1 FROM catalog_items c WHERE c.asset_id = a.id)
          AND NOT EXISTS (SELECT 1 FROM vip_levels v WHERE v.icon_asset = a.id)
          AND NOT EXISTS (SELECT 1 FROM gift_catalog g WHERE g.icon_asset = a.id)`);
    }
    await audit(tx, { actorId, action: 'avatar.reject', targetType: 'user', targetId: target.uid, details: { uploadId: row.id, reason }, ip });
    return true;
  });
}
