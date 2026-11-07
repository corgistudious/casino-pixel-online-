/**
 * Margin post-process (no paid call): shrinks the artwork uniformly and adds a transparent margin so
 * nothing sits on the canvas edge. Canvas size is unchanged; the artwork itself is not altered.
 * Used for wide 9-slice / plaque art the model drew edge to edge (nothing cropped, margin too tight).
 */
import sharp from 'sharp';

export async function padMargin(src, out, marginFrac = 0.05) {
  const meta = await sharp(src).metadata();
  const w = meta.width;
  const h = meta.height;
  const iw = Math.round(w * (1 - 2 * marginFrac));
  const ih = Math.round(h * (1 - 2 * marginFrac));
  const inner = await sharp(src).ensureAlpha().resize(iw, ih, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: inner, left: Math.round((w - iw) / 2), top: Math.round((h - ih) / 2) }])
    .png()
    .toFile(out);
  return out;
}
