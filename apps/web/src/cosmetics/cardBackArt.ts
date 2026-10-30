import { cosmeticDef, type CardBackArt } from '@casino/shared';
import { drawGlyph } from '../ui/glyphs';

/**
 * Seasonal card backs drawn on a canvas (Phaser textures and shop previews share it): ivory edge,
 * gradient field, a printed pattern, an ornamental frame and a central medallion with the motif.
 * A back never reveals anything about the card.
 */
type Ctx = CanvasRenderingContext2D;

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function libraryCardBack(itemId: string | null | undefined): CardBackArt | null {
  const def = itemId ? cosmeticDef(itemId) : undefined;
  return def?.kind === 'card_back' ? def.art : null;
}

export function paintCardBack(ctx: Ctx, w: number, h: number, a: CardBackArt) {
  const u = w / 48; // design unit (48×68 card)
  rr(ctx, 0.5 * u, 0.5 * u, w - u, h - u, 4 * u);
  ctx.fillStyle = '#fbf7ee';
  ctx.fill();
  ctx.save();
  rr(ctx, 2 * u, 2 * u, w - 4 * u, h - 4 * u, 3.5 * u);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, a.bg[0]);
  g.addColorStop(1, a.bg[1]);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = a.accent;
  ctx.fillStyle = a.accent;
  ctx.lineWidth = 0.5 * u;
  if (a.pattern === 'lattice' || a.pattern === 'diamond') {
    const step = (a.pattern === 'lattice' ? 4 : 6) * u;
    for (let i = -h; i < w + h; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.moveTo(i + h, 0);
      ctx.lineTo(i, h);
      ctx.stroke();
    }
  } else if (a.pattern === 'waves') {
    for (let y = 3 * u; y < h; y += 4 * u) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += u) ctx.lineTo(x, y + Math.sin(x / (3 * u) + y) * 1.2 * u);
      ctx.stroke();
    }
  } else if (a.pattern === 'rays') {
    ctx.translate(w / 2, h / 2);
    for (let i = 0; i < 24; i++) {
      ctx.rotate(Math.PI / 12);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(h, -2 * u);
      ctx.lineTo(h, 2 * u);
      ctx.fill();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 22; i++) drawGlyph(ctx, a.motif, rnd() * w, rnd() * h, (3 + rnd() * 3) * u, a.accent, (rnd() - 0.5) * 1.4);
  }
  ctx.restore();
  // Ornamental frame.
  ctx.strokeStyle = a.border;
  ctx.lineWidth = 1.1 * u;
  rr(ctx, 4 * u, 4 * u, w - 8 * u, h - 8 * u, 2.5 * u);
  ctx.stroke();
  ctx.lineWidth = 0.45 * u;
  rr(ctx, 5.8 * u, 5.8 * u, w - 11.6 * u, h - 11.6 * u, 2 * u);
  ctx.stroke();
  for (const [x, y] of [[7, 7], [41, 7], [7, 61], [41, 61]] as const) drawGlyph(ctx, 'diamond', x * u, y * u, 3.4 * u, a.border);
  // Medallion.
  const cx = w / 2;
  const cy = h / 2;
  ctx.fillStyle = a.bg[1];
  ctx.beginPath();
  ctx.arc(cx, cy, 11 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.2 * u;
  ctx.strokeStyle = a.border;
  ctx.stroke();
  ctx.lineWidth = 0.4 * u;
  ctx.beginPath();
  ctx.arc(cx, cy, 9 * u, 0, Math.PI * 2);
  ctx.stroke();
  drawGlyph(ctx, a.motif, cx, cy, 13 * u, a.accent);
}

const urls = new Map<string, string>();
/** PNG data URL of a library card back at `width` px (cached), for <img> previews. */
export function cardBackDataUrl(itemId: string, width = 96): string | null {
  const art = libraryCardBack(itemId);
  if (!art || typeof document === 'undefined') return null;
  const key = `${itemId}:${width}`;
  const hit = urls.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.round((width * 68) / 48);
  paintCardBack(c.getContext('2d')!, c.width, c.height, art);
  const url = c.toDataURL('image/png');
  urls.set(key, url);
  return url;
}
