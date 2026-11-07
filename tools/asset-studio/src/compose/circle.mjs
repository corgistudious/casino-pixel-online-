/**
 * Circle mask post-process (no paid call): keeps the round artwork and makes everything outside the
 * circle truly transparent (real alpha). Used for profile avatars, which the model painted as a round
 * badge on a white square; the UI shows avatars round, so the white corners carried no artwork.
 */
import sharp from 'sharp';

/** radiusFrac: circle radius as a fraction of the side (0.47 keeps a ~3% clear margin). */
export async function circleMask(src, out, radiusFrac = 0.47, feather = 2) {
  const meta = await sharp(src).metadata();
  const s = Math.min(meta.width, meta.height);
  const c = s / 2;
  const r = s * radiusFrac;
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}"><defs><radialGradient id="m" cx="${c}" cy="${c}" r="${r}" gradientUnits="userSpaceOnUse"><stop offset="${(r - feather) / r}" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><circle cx="${c}" cy="${c}" r="${r}" fill="url(#m)"/></svg>`);
  await sharp(src).resize(s, s, { fit: 'cover' }).ensureAlpha().composite([{ input: await sharp(mask).png().toBuffer(), blend: 'dest-in' }]).png().toFile(out);
  return out;
}
