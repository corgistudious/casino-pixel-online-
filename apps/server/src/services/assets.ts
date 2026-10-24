import { createHash } from 'node:crypto';
import { ASSET_MAX_BYTES, ASSET_MAX_SIDE, ASSET_MIN_SIDE } from '@casino/shared';
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { assets } from '../db/schema';
import { fail } from '../errors';

export interface ImageInfo {
  mime: 'image/png' | 'image/webp' | 'image/gif';
  ext: 'png' | 'webp' | 'gif';
  width: number;
  height: number;
  animated: boolean;
}

const ascii = (b: Buffer, start: number, len: number) => b.toString('latin1', start, start + len);

/**
 * Identifies an image from its bytes (never from the file name or declared type) and reads its
 * size from the header. Only PNG/APNG, WebP and GIF are accepted; SVG and anything else is refused.
 */
export function inspectImage(b: Buffer): ImageInfo {
  if (b.length < 32) throw fail('invalid_asset');
  // PNG: signature, then the IHDR chunk with width/height (big-endian). APNG adds an acTL chunk.
  if (b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a && ascii(b, 12, 4) === 'IHDR') {
    return { mime: 'image/png', ext: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20), animated: b.includes('acTL', 0, 'latin1') };
  }
  // GIF87a / GIF89a: logical screen size (little-endian).
  if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') {
    return { mime: 'image/gif', ext: 'gif', width: b.readUInt16LE(6), height: b.readUInt16LE(8), animated: b.includes('NETSCAPE2.0', 0, 'latin1') };
  }
  // WebP: RIFF container with a VP8 / VP8L / VP8X chunk.
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
    const chunk = ascii(b, 12, 4);
    if (chunk === 'VP8 ' && b.length >= 30) {
      return { mime: 'image/webp', ext: 'webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, animated: false };
    }
    if (chunk === 'VP8L' && b.length >= 25 && b[20] === 0x2f) {
      const b0 = b[21]!;
      const b1 = b[22]!;
      const b2 = b[23]!;
      const b3 = b[24]!;
      return { mime: 'image/webp', ext: 'webp', width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)), animated: false };
    }
    if (chunk === 'VP8X' && b.length >= 30) {
      return { mime: 'image/webp', ext: 'webp', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3), animated: (b[20]! & 0x02) !== 0 };
    }
  }
  throw fail('invalid_asset');
}

/** Validates and stores an image; identical uploads map to the same id (SHA-256). */
export async function storeAsset(db: DbOrTx, bytes: Buffer, createdBy: string) {
  if (bytes.length > ASSET_MAX_BYTES) throw fail('invalid_asset', 'file too large');
  const info = inspectImage(bytes);
  if (info.width < ASSET_MIN_SIDE || info.height < ASSET_MIN_SIDE || info.width > ASSET_MAX_SIDE || info.height > ASSET_MAX_SIDE) {
    throw fail('invalid_asset', `image must be ${ASSET_MIN_SIDE}–${ASSET_MAX_SIDE}px per side`);
  }
  const ratio = info.width / info.height;
  if (ratio < 0.9 || ratio > 1.1) throw fail('invalid_asset', 'image must be (nearly) square');
  const id = `${createHash('sha256').update(bytes).digest('hex')}.${info.ext}`;
  await db
    .insert(assets)
    .values({ id, mime: info.mime, bytes, width: info.width, height: info.height, size: bytes.length, animated: info.animated, createdBy })
    .onConflictDoNothing();
  return { id, url: assetUrl(id), ...info, size: bytes.length };
}

export function assetUrl(id: string): string {
  return `/api/assets/${id}`;
}

export async function loadAsset(db: DbOrTx, id: string) {
  const [row] = await db.select().from(assets).where(eq(assets.id, id));
  return row ?? null;
}
