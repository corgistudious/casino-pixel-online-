import Phaser from 'phaser';
import type { CardBackArt } from '@casino/shared';
import { paintCardBack } from '../cosmetics/cardBackArt';
import { paintTable, type OvalGeometry, type TableLayout } from '../cosmetics/tableArt';
import { ROULETTE_WHEEL, rouletteColor, type Card, type SlotSymbol } from '@casino/shared';
import { FONT_DISPLAY, FONT_UI, RES, WORLD_H, WORLD_W } from './hd';

/**
 * Procedural HD vector art. Every asset is drawn with canvas paths, gradients and
 * shadows at RES× resolution — original artwork with no third-party licences.
 * Raster replacements can be dropped in through ASSET_OVERRIDES (see docs/ART_PIPELINE.md).
 */

type Ctx = CanvasRenderingContext2D;

/** Optional raster files that replace a procedural texture of the same key. Filled in when final art is delivered. */
export const ASSET_OVERRIDES: Record<string, string> = {};

export function preloadOverrides(scene: Phaser.Scene) {
  for (const [key, url] of Object.entries(ASSET_OVERRIDES)) if (!scene.textures.exists(key)) scene.load.image(key, url);
}

export function hdTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx) => void) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, Math.ceil(w * RES), Math.ceil(h * RES));
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.save();
  ctx.scale(RES, RES);
  draw(ctx);
  ctx.restore();
  tex.refresh();
}

/** Adds an image of an HD texture at its natural world size (times `scale`). */
export function hdImage(scene: Phaser.Scene, x: number, y: number, key: string, scale = 1) {
  const img = scene.add.image(x, y, key);
  const fromOverride = key in ASSET_OVERRIDES;
  // Overrides are authored at 3× world size.
  img.setScale((scale / (fromOverride ? 3 : RES)));
  return img;
}

export const hdScale = (key: string, scale = 1) => scale / (key in ASSET_OVERRIDES ? 3 : RES);

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function linear(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

export function radial(ctx: Ctx, x: number, y: number, r0: number, r1: number, stops: [number, string][], fx = x, fy = y) {
  const g = ctx.createRadialGradient(fx, fy, r0, x, y, r1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

const GOLD: [number, string][] = [
  [0, '#fff1b8'],
  [0.35, '#f2c14e'],
  [0.6, '#b9801c'],
  [1, '#f7d77a'],
];

// ---------------------------------------------------------------- backgrounds

/** Emerald felt with a soft spotlight, fibre noise and vignette. */
export function ensureFelt(scene: Phaser.Scene, key = 'bg-felt', tint: 'emerald' | 'navy' = 'emerald') {
  hdTexture(scene, key, WORLD_W, WORLD_H, (ctx) => {
    const [c0, c1, c2] = tint === 'emerald' ? ['#1f8a5a', '#0f5a39', '#062a1b'] : ['#2a3474', '#151a45', '#070920'];
    ctx.fillStyle = radial(ctx, WORLD_W / 2, WORLD_H * 0.42, 10, WORLD_W * 0.75, [
      [0, c0],
      [0.55, c1],
      [1, c2],
    ]);
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // Fibre noise
    const rnd = new Phaser.Math.RandomDataGenerator(['felt']);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = rnd.frac() > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(rnd.frac() * WORLD_W, rnd.frac() * WORLD_H, 0.6, 0.6);
    }
    ctx.fillStyle = radial(ctx, WORLD_W / 2, WORLD_H / 2, WORLD_H * 0.45, WORLD_W * 0.7, [
      [0, 'rgba(0,0,0,0)'],
      [1, 'rgba(0,0,0,0.55)'],
    ]);
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  });
}

/** Dark lounge backdrop with bokeh lights and neon haze. */
export function ensureLounge(scene: Phaser.Scene) {
  hdTexture(scene, 'bg-lounge', WORLD_W, WORLD_H, (ctx) => {
    ctx.fillStyle = linear(ctx, 0, 0, 0, WORLD_H, [
      [0, '#120c2a'],
      [0.6, '#0a0818'],
      [1, '#050410'],
    ]);
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    const rnd = new Phaser.Math.RandomDataGenerator(['lounge']);
    for (let i = 0; i < 40; i++) {
      const x = rnd.frac() * WORLD_W;
      const y = rnd.frac() * WORLD_H * 0.7;
      const r = 6 + rnd.frac() * 22;
      const hue = rnd.pick(['255,196,80', '190,90,255', '80,200,255', '255,90,140']);
      ctx.fillStyle = radial(ctx, x, y, 0, r, [
        [0, `rgba(${hue},0.22)`],
        [1, `rgba(${hue},0)`],
      ]);
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.fillStyle = radial(ctx, WORLD_W / 2, WORLD_H, 0, WORLD_W * 0.6, [
      [0, 'rgba(242,193,78,0.18)'],
      [1, 'rgba(242,193,78,0)'],
    ]);
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  });
}

// ---------------------------------------------------------------- cards

export const CARD_W = 48;
export const CARD_H = 68;

function heart(ctx: Ctx, cx: number, cy: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.5);
  ctx.bezierCurveTo(cx - s * 0.95, cy - s * 0.05, cx - s * 0.5, cy - s * 0.8, cx, cy - s * 0.28);
  ctx.bezierCurveTo(cx + s * 0.5, cy - s * 0.8, cx + s * 0.95, cy - s * 0.05, cx, cy + s * 0.5);
  ctx.fill();
}

function diamondSuit(ctx: Ctx, cx: number, cy: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.55);
  ctx.quadraticCurveTo(cx + s * 0.18, cy - s * 0.18, cx + s * 0.42, cy);
  ctx.quadraticCurveTo(cx + s * 0.18, cy + s * 0.18, cx, cy + s * 0.55);
  ctx.quadraticCurveTo(cx - s * 0.18, cy + s * 0.18, cx - s * 0.42, cy);
  ctx.quadraticCurveTo(cx - s * 0.18, cy - s * 0.18, cx, cy - s * 0.55);
  ctx.fill();
}

function spade(ctx: Ctx, cx: number, cy: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.55);
  ctx.bezierCurveTo(cx + s * 0.95, cy + s * 0.05, cx + s * 0.5, cy + s * 0.65, cx, cy + s * 0.18);
  ctx.bezierCurveTo(cx - s * 0.5, cy + s * 0.65, cx - s * 0.95, cy + s * 0.05, cx, cy - s * 0.55);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.1);
  ctx.lineTo(cx + s * 0.2, cy + s * 0.55);
  ctx.lineTo(cx - s * 0.2, cy + s * 0.55);
  ctx.closePath();
  ctx.fill();
}

function club(ctx: Ctx, cx: number, cy: number, s: number) {
  const r = s * 0.24;
  for (const [dx, dy] of [
    [0, -0.28],
    [-0.27, 0.06],
    [0.27, 0.06],
  ]) {
    ctx.beginPath();
    ctx.arc(cx + dx! * s, cy + dy! * s, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + s * 0.18, cy + s * 0.55);
  ctx.lineTo(cx - s * 0.18, cy + s * 0.55);
  ctx.closePath();
  ctx.fill();
}

export function drawSuit(ctx: Ctx, suit: string, cx: number, cy: number, s: number) {
  if (suit === 'H') heart(ctx, cx, cy, s);
  else if (suit === 'D') diamondSuit(ctx, cx, cy, s);
  else if (suit === 'S') spade(ctx, cx, cy, s);
  else club(ctx, cx, cy, s);
}

export function cardKey(card: Card | null): string {
  return card ? `card-${card}` : 'card-back';
}

export function ensureCardTexture(scene: Phaser.Scene, card: Card | null) {
  hdTexture(scene, cardKey(card), CARD_W, CARD_H, (ctx) => {
    const W = CARD_W;
    const H = CARD_H;
    if (!card) {
      // V7.1 Game Center back: royal purple, gold lattice, metallic frame and a Keyo spade crest.
      roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 4.5);
      ctx.fillStyle = linear(ctx, 0, 0, W, H, [
        [0, '#5b2aa3'],
        [0.55, '#2c1260'],
        [1, '#160830'],
      ]);
      ctx.fill();
      ctx.save();
      roundRect(ctx, 3.5, 3.5, W - 7, H - 7, 3);
      ctx.clip();
      ctx.strokeStyle = 'rgba(247,215,122,0.28)';
      ctx.lineWidth = 0.45;
      for (let i = -H; i < W + H; i += 3.4) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + H, H);
        ctx.moveTo(i + H, 0);
        ctx.lineTo(i, H);
        ctx.stroke();
      }
      ctx.fillStyle = radial(ctx, W / 2, H / 2, 0, W * 0.6, [
        [0, 'rgba(199,155,255,0.35)'],
        [1, 'rgba(199,155,255,0)'],
      ]);
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      ctx.strokeStyle = linear(ctx, 0, 0, W, H, GOLD);
      ctx.lineWidth = 1.2;
      roundRect(ctx, 3.5, 3.5, W - 7, H - 7, 3);
      ctx.stroke();
      ctx.lineWidth = 0.5;
      roundRect(ctx, 5.5, 5.5, W - 11, H - 11, 2);
      ctx.stroke();
      // Crest: gold medallion with a spade.
      ctx.fillStyle = radial(ctx, W / 2 - 3, H / 2 - 4, 1, 13, [
        [0, '#fff1b8'],
        [0.5, '#f2c14e'],
        [1, '#8a5a12'],
      ]);
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2c1260';
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 8.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = linear(ctx, W / 2 - 6, H / 2 - 6, W / 2 + 6, H / 2 + 6, GOLD);
      spade(ctx, W / 2, H / 2 + 0.5, 11);
      // Gloss
      ctx.fillStyle = linear(ctx, 0, 0, 0, H * 0.5, [
        [0, 'rgba(255,255,255,0.18)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
      roundRect(ctx, 1, 1, W - 2, H * 0.45, 4);
      ctx.fill();
      return;
    }
    const rank = card.slice(0, -1);
    const suit = card.slice(-1);
    const red = suit === 'H' || suit === 'D';
    const ink = red ? '#c8102e' : '#16142b';

    // V7.1 2.5D face: warm white with a soft top light, bevelled edge and large readable indices.
    roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 4.5);
    ctx.fillStyle = linear(ctx, 0, 0, 0, H, [
      [0, '#ffffff'],
      [0.7, '#f7f4ee'],
      [1, '#e6dfd0'],
    ]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,30,60,0.35)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 0.6;
    roundRect(ctx, 1.4, 1.4, W - 2.8, H - 2.8, 3.6);
    ctx.stroke();

    const corner = (flip: boolean) => {
      ctx.save();
      if (flip) {
        ctx.translate(W, H);
        ctx.rotate(Math.PI);
      }
      ctx.fillStyle = ink;
      ctx.font = `800 ${rank === '10' ? 12 : 14}px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      if (rank === '10') {
        ctx.save();
        ctx.scale(0.86, 1);
        ctx.fillText(rank, 8.5 / 0.86, 2.5);
        ctx.restore();
      } else ctx.fillText(rank, 8.5, 2.5);
      drawSuit(ctx, suit, 8.5, 22, 8.5);
      ctx.restore();
    };
    corner(false);
    corner(true);

    if (rank === 'J' || rank === 'Q' || rank === 'K') {
      roundRect(ctx, 13, 11, W - 26, H - 22, 2);
      ctx.fillStyle = linear(ctx, 0, 11, 0, H - 11, red ? [[0, '#fff4f0'], [1, '#f8d7cf']] : [[0, '#f1f2ff'], [1, '#d6d8f0']]);
      ctx.fill();
      ctx.strokeStyle = linear(ctx, 13, 11, W - 13, H - 11, GOLD);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.font = `700 22px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(rank, W / 2, H / 2 - 5);
      drawSuit(ctx, suit, W / 2, H / 2 + 13, 9);
    } else {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.18)';
      ctx.shadowBlur = 1.5;
      ctx.shadowOffsetY = 0.8;
      ctx.fillStyle = ink;
      drawSuit(ctx, suit, W / 2, H / 2 + 1, rank === 'A' ? 26 : 20);
      ctx.restore();
    }
  });
}

// ---------------------------------------------------------------- chips (V7.1 2.5D)

export const CHIP_STYLES: Record<number, { base: string; dark: string; insert: string; text: string }> = {
  10: { base: '#e9e6f2', dark: '#9d98b8', insert: '#3d3790', text: '#2b2766' },
  50: { base: '#d42a44', dark: '#7d1222', insert: '#ffffff', text: '#ffffff' },
  100: { base: '#1f9d61', dark: '#0d5434', insert: '#ffffff', text: '#ffffff' },
  500: { base: '#2f5ee8', dark: '#162f87', insert: '#ffffff', text: '#ffffff' },
  1000: { base: '#24203f', dark: '#08070f', insert: '#f2c14e', text: '#f7d77a' },
  5000: { base: '#9b4dea', dark: '#4e1a85', insert: '#f2c14e', text: '#ffffff' },
};

export function chipDenomFor(amount: number): number {
  const denoms = Object.keys(CHIP_STYLES).map(Number).sort((a, b) => b - a);
  return denoms.find((d) => amount >= d) ?? 10;
}

export const CHIP_SIZE = 32;

/**
 * V7.1 Premium 2.5D casino chip: a visible striped edge (thickness), a bevelled top face with eight
 * edge inserts, a metallic gold inlay ring, a recessed centre with the value, and a top gloss.
 * Same keys and footprint as before (CHIP_SIZE × CHIP_SIZE+3), so every table picks it up unchanged.
 * Also 'chip-glow' (win halo under a paid stack).
 */
export function ensureChipTextures(scene: Phaser.Scene) {
  for (const [value, c] of Object.entries(CHIP_STYLES)) {
    hdTexture(scene, `chip-${value}`, CHIP_SIZE, CHIP_SIZE + 3, (ctx) => {
      const cx = CHIP_SIZE / 2;
      const cy = CHIP_SIZE / 2 - 0.5;
      const r = CHIP_SIZE / 2 - 1.2;
      const depth = 3.2;
      // Contact shadow.
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath();
      ctx.ellipse(cx + 0.5, cy + depth + 0.9, r, r * 0.97, 0, 0, Math.PI * 2);
      ctx.fill();
      // Edge band (thickness) with the insert stripes running down the side.
      ctx.fillStyle = c.dark;
      ctx.beginPath();
      ctx.arc(cx, cy + depth, r, 0, Math.PI);
      ctx.lineTo(cx - r, cy);
      ctx.arc(cx, cy, r, Math.PI, 0, true);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c.insert;
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < 8; i++) {
        const a = (i + 0.5) * (Math.PI / 8) + Math.PI / 16;
        if (a <= 0.12 || a >= Math.PI - 0.12) continue;
        const x = cx + Math.cos(a) * r;
        const w = Math.max(0.8, 2.6 * Math.sin(a));
        ctx.fillRect(x - w / 2, cy + Math.sin(a) * r - 0.2, w, depth + 0.2);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = linear(ctx, 0, cy, 0, cy + r + depth, [[0, 'rgba(255,255,255,0.10)'], [1, 'rgba(0,0,0,0.35)']]);
      ctx.beginPath();
      ctx.arc(cx, cy + depth, r, 0, Math.PI);
      ctx.lineTo(cx - r, cy);
      ctx.arc(cx, cy, r, Math.PI, 0, true);
      ctx.closePath();
      ctx.fill();
      // Top face.
      ctx.fillStyle = radial(ctx, cx, cy, 1, r, [[0, c.base], [0.82, c.base], [1, c.dark]], cx - 5, cy - 6);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      // Edge inserts on the top face.
      ctx.fillStyle = c.insert;
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((i * Math.PI) / 4);
        roundRect(ctx, -2.2, -r + 0.5, 4.4, 3.8, 0.9);
        ctx.fill();
        ctx.restore();
      }
      // Metallic gold inlay ring.
      ctx.strokeStyle = linear(ctx, cx - r, cy - r, cx + r, cy + r, GOLD);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      // Recessed centre: darker rim at the top (in shadow), light at the bottom.
      ctx.fillStyle = radial(ctx, cx, cy, 0, r * 0.62, [[0, c.base], [0.8, c.base], [1, c.dark]], cx - 1.5, cy - 2.5);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.6, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.6, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      // Value.
      const label = Number(value) >= 1000 ? `${Number(value) / 1000}K` : value;
      ctx.font = `900 ${label.length > 3 ? 6.5 : 8}px ${FONT_UI}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.strokeText(label, cx, cy + 0.6);
      ctx.fillStyle = c.text;
      ctx.fillText(label, cx, cy + 0.6);
      // Gloss across the upper half.
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = linear(ctx, 0, cy - r, 0, cy + 2, [[0, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);
      ctx.beginPath();
      ctx.ellipse(cx - 2, cy - r * 0.5, r * 0.85, r * 0.42, -0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
  hdTexture(scene, 'chip-glow', 44, 44, (ctx) => {
    ctx.fillStyle = radial(ctx, 22, 22, 0, 22, [[0, 'rgba(255,240,190,0.95)'], [0.35, 'rgba(242,193,78,0.55)'], [1, 'rgba(242,193,78,0)']]);
    ctx.fillRect(0, 0, 44, 44);
  });
}

// ---------------------------------------------------------------- dice (V7.1 2.5D)

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

export const DIE_SIZE = 34;

/** One ivory 2.5D die body (visible lower/right faces, bevelled top) with carved pips. */
function paintDie(ctx: Ctx, face: number) {
  const s = DIE_SIZE - 3;
  const d = 3; // visible depth of the lower / right faces
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 3.5;
  ctx.shadowOffsetY = 2;
  // Side faces (the body seen slightly from above-left).
  roundRect(ctx, 1 + d, 1 + d, s, s, 7);
  ctx.fillStyle = linear(ctx, 0, 0, s + d, s + d, [[0, '#d9cfe6'], [1, '#9c90b4']]);
  ctx.fill();
  ctx.restore();
  // Top face.
  roundRect(ctx, 1, 1, s, s, 7);
  ctx.fillStyle = linear(ctx, 1, 1, s, s, [[0, '#ffffff'], [0.6, '#f3eef9'], [1, '#d8cfe6']]);
  ctx.fill();
  // Bevel: bright upper-left edge, soft shade along the lower-right edge.
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = linear(ctx, 1, 1, s, s, [[0, 'rgba(255,255,255,0.95)'], [0.5, 'rgba(255,255,255,0.2)'], [1, 'rgba(110,96,140,0.55)']]);
  roundRect(ctx, 1.6, 1.6, s - 1.2, s - 1.2, 6.4);
  ctx.stroke();
  ctx.fillStyle = radial(ctx, s * 0.32, s * 0.28, 0, s * 0.62, [[0, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']]);
  roundRect(ctx, 1, 1, s, s, 7);
  ctx.fill();
  // Carved pips (Asian dice: the 1 and the 4 are red).
  const red = face === 1 || face === 4;
  for (const [dx, dy] of PIPS[face]!) {
    const x = 1 + s / 2 + dx * s * 0.27;
    const y = 1 + s / 2 + dy * s * 0.27;
    const pr = face === 1 ? 5.2 : 3.1;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x + 0.5, y + 0.6, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = radial(ctx, x, y, 0, pr, red ? [[0, '#a00d24'], [0.7, '#d62a43'], [1, '#ff6b7e']] : [[0, '#07060f'], [0.7, '#2a2645'], [1, '#5b5680']], x - pr * 0.35, y - pr * 0.35);
    ctx.beginPath();
    ctx.arc(x, y, pr, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Dice: die-1 … die-6 (same keys / size as before) plus 'die-blur', the rolling state (motion streak),
 * used by Sic Bo while the dice tumble.
 */
export function ensureDiceTextures(scene: Phaser.Scene) {
  for (let face = 1; face <= 6; face++) hdTexture(scene, `die-${face}`, DIE_SIZE + 4, DIE_SIZE + 4, (ctx) => paintDie(ctx, face));
  hdTexture(scene, 'die-blur', DIE_SIZE + 4, DIE_SIZE + 4, (ctx) => {
    for (let i = 3; i >= 0; i--) {
      ctx.save();
      ctx.globalAlpha = i === 0 ? 1 : 0.18;
      ctx.translate(-i * 2.2, -i * 1.2);
      ctx.translate((DIE_SIZE + 4) / 2, (DIE_SIZE + 4) / 2);
      ctx.rotate(0.35 - i * 0.1);
      ctx.translate(-(DIE_SIZE + 4) / 2, -(DIE_SIZE + 4) / 2);
      paintDie(ctx, i === 0 ? 5 : 3);
      ctx.restore();
    }
  });
}

/**
 * Sic Bo props (V7.1 2.5D): 'sicbo-plate', a porcelain dice plate with a bevelled gold rim and a blue
 * glaze ring; 'sicbo-dome', the crystal shaker dome that covers the dice while they tumble.
 */
export const PLATE_SIZE = 168;
export function ensureSicBoProps(scene: Phaser.Scene) {
  hdTexture(scene, 'sicbo-plate', PLATE_SIZE, PLATE_SIZE, (ctx) => {
    const c = PLATE_SIZE / 2;
    const r = 72;
    ctx.fillStyle = radial(ctx, c + 4, c + 7, r * 0.6, r + 9, [[0, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']]);
    ctx.beginPath();
    ctx.arc(c + 4, c + 7, r + 9, 0, Math.PI * 2);
    ctx.fill();
    // Rim thickness then the bevelled gold rim.
    ctx.fillStyle = '#6b4708';
    ctx.beginPath();
    ctx.arc(c, c + 3, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = linear(ctx, c - r, c - r, c + r, c + r, GOLD);
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(c, c, r - 0.8, Math.PI * 1.05, Math.PI * 1.7);
    ctx.stroke();
    // Porcelain well, lit from the upper left, deeper towards the lower right.
    ctx.fillStyle = radial(ctx, c, c, 0, r - 6, [[0, '#ffffff'], [0.75, '#f4efe4'], [1, '#cfc6b3']], c - 18, c - 22);
    ctx.beginPath();
    ctx.arc(c, c, r - 6, 0, Math.PI * 2);
    ctx.fill();
    // Blue glaze ring with small motif dots.
    ctx.strokeStyle = '#2f4fb8';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(c, c, r - 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#2f4fb8';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(c + Math.cos(a) * (r - 17), c + Math.sin(a) * (r - 17), 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = radial(ctx, c + 4, c + 6, r * 0.2, r - 20, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(60,45,20,0.18)']]);
    ctx.beginPath();
    ctx.arc(c, c, r - 20, 0, Math.PI * 2);
    ctx.fill();
  });
  hdTexture(scene, 'sicbo-dome', PLATE_SIZE, PLATE_SIZE, (ctx) => {
    const c = PLATE_SIZE / 2;
    const r = 70;
    // Crystal: a faint violet tint, bright rim, specular streaks; mostly transparent so the dice show.
    ctx.fillStyle = radial(ctx, c, c, r * 0.2, r, [[0, 'rgba(210,200,255,0.10)'], [0.85, 'rgba(170,150,255,0.18)'], [1, 'rgba(255,255,255,0.45)']], c - 20, c - 24);
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(c, c, r - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = linear(ctx, c - r, c - r, c + r, c + r, GOLD);
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(c, c, r + 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(c - r * 0.38, c - r * 0.42, r * 0.34, r * 0.12, -0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(c, c, r - 8, Math.PI * 0.15, Math.PI * 0.4);
    ctx.stroke();
    // Gold knob on top.
    ctx.fillStyle = radial(ctx, c, c, 0, 10, [[0, '#fff7d6'], [0.5, '#f2c14e'], [1, '#8a5a12']], c - 3, c - 4);
    ctx.beginPath();
    ctx.arc(c, c, 9, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * Traditional Tài Xỉu cover seen from above (V7.1 2.5D): a black lacquered dome with its rim
 * thickness showing at the bottom, a red lacquer band with a gold motif ring, the turned foot at
 * the top, glossy reflections and a contact shadow. Square so it can rotate while shaking.
 */
export const BOWL_W = 168;
export const BOWL_H = 168;
export const BOWL_R = 72;

export function ensureBowlTexture(scene: Phaser.Scene) {
  hdTexture(scene, 'taixiu-bowl', BOWL_W, BOWL_H, (ctx) => {
    const cx = BOWL_W / 2;
    const cy = BOWL_H / 2 - 2;
    const r = BOWL_R;
    ctx.fillStyle = radial(ctx, cx + 5, cy + 9, r * 0.7, r + 10, [[0, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']]);
    ctx.beginPath();
    ctx.arc(cx + 5, cy + 9, r + 10, 0, Math.PI * 2);
    ctx.fill();
    // Rim thickness (2.5D): the lower edge of the dome.
    ctx.fillStyle = linear(ctx, 0, cy, 0, cy + r + 5, [[0, '#2a0a10'], [1, '#090305']]);
    ctx.beginPath();
    ctx.arc(cx, cy + 4, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = linear(ctx, cx - r, cy, cx + r, cy + r, GOLD);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy + 4, r - 0.6, Math.PI * 0.05, Math.PI * 0.95);
    ctx.stroke();
    // Lacquered dome.
    ctx.fillStyle = radial(ctx, cx, cy, 0, r, [[0, '#4b4651'], [0.35, '#24202a'], [0.75, '#0e0c11'], [1, '#050406']], cx - r * 0.32, cy - r * 0.36);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // Red lacquer band with a gold motif ring.
    ctx.strokeStyle = linear(ctx, cx - r, cy - r, cx + r, cy + r, [[0, '#b0182e'], [0.5, '#6e0a18'], [1, '#c4253c']]);
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = linear(ctx, cx - r, cy - r, cx + r, cy + r, GOLD);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * (r - 6.5), cy + Math.sin(a) * (r - 6.5));
      ctx.rotate(a + Math.PI / 4);
      ctx.fillRect(-1.3, -1.3, 2.6, 2.6);
      ctx.restore();
    }
    ctx.strokeStyle = linear(ctx, cx - r, cy - r, cx + r, cy + r, GOLD);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 11, 0, Math.PI * 2);
    ctx.stroke();
    // Turned foot ring at the top of the inverted bowl.
    const fr = 22;
    ctx.fillStyle = radial(ctx, cx, cy, 0, fr, [[0, '#2c2830'], [1, '#0b0a0d']], cx - 6, cy - 7);
    ctx.beginPath();
    ctx.arc(cx, cy, fr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = linear(ctx, cx - fr, cy - fr, cx + fr, cy + fr, GOLD);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, fr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, fr - 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = radial(ctx, cx, cy, 0, 7, [[0, '#fff7d6'], [0.5, '#f2c14e'], [1, '#8a5a12']], cx - 2, cy - 2);
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
    // Glossy highlights.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = radial(ctx, cx - r * 0.38, cy - r * 0.42, 0, r * 0.55, [[0, 'rgba(255,255,255,0.32)'], [1, 'rgba(255,255,255,0)']]);
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.36, cy - r * 0.4, r * 0.5, r * 0.28, -0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r - 13, Math.PI * 1.05, Math.PI * 1.45);
    ctx.stroke();
  });
}

// ---------------------------------------------------------------- roulette

export const WHEEL_SIZE = 150;

/** Wheel with numbered pockets. Pocket i is centred at angle i·step clockwise from the top. */
export function ensureWheelTextures(scene: Phaser.Scene) {
  hdTexture(scene, 'roulette-wheel', WHEEL_SIZE, WHEEL_SIZE, (ctx) => {
    const c = WHEEL_SIZE / 2;
    const n = ROULETTE_WHEEL.length;
    const step = (Math.PI * 2) / n;
    const rOuter = c - 1;
    const rTrack = c - 10;
    const rPocketOut = c - 13;
    const rPocketIn = c - 30;
    const rCone = c - 34;

    ctx.fillStyle = radial(ctx, c, c, rTrack, rOuter, [
      [0, '#3a1d0b'],
      [0.5, '#8a4f22'],
      [1, '#2a1306'],
    ]);
    ctx.beginPath();
    ctx.arc(c, c, rOuter, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = linear(ctx, 0, 0, WHEEL_SIZE, WHEEL_SIZE, GOLD);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(c, c, rTrack, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#1a1208';
    ctx.beginPath();
    ctx.arc(c, c, rTrack - 0.6, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < n; i++) {
      const num = ROULETTE_WHEEL[i]!;
      const a0 = -Math.PI / 2 + i * step - step / 2;
      const a1 = a0 + step;
      const col = rouletteColor(num);
      ctx.beginPath();
      ctx.arc(c, c, rPocketOut, a0, a1);
      ctx.arc(c, c, rPocketIn, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle =
        col === 'red'
          ? radial(ctx, c, c, rPocketIn, rPocketOut, [[0, '#8f0f22'], [1, '#e0263f']])
          : col === 'black'
            ? radial(ctx, c, c, rPocketIn, rPocketOut, [[0, '#08070f'], [1, '#2d2a45']])
            : radial(ctx, c, c, rPocketIn, rPocketOut, [[0, '#0a5a33'], [1, '#22b46e']]);
      ctx.fill();
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(i * step);
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 6px ${FONT_UI}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(num), 0, -(rPocketOut - 5));
      ctx.restore();
    }
    // Gold frets
    ctx.strokeStyle = '#e8b64a';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + i * step - step / 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * rPocketIn, c + Math.sin(a) * rPocketIn);
      ctx.lineTo(c + Math.cos(a) * rPocketOut, c + Math.sin(a) * rPocketOut);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = linear(ctx, 0, 0, WHEEL_SIZE, WHEEL_SIZE, GOLD);
    for (const r of [rPocketOut, rPocketIn, rPocketIn - 12]) {
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Pocket ring where the numbers sit
    ctx.fillStyle = radial(ctx, c, c, 0, rCone, [
      [0, '#c98a3a'],
      [0.55, '#6a3a16'],
      [1, '#3a1d0b'],
    ]);
    ctx.beginPath();
    ctx.arc(c, c, rCone, 0, Math.PI * 2);
    ctx.fill();
    // 2.5D depth: pockets sink towards their inner edge, the polished cone catches the light, and the
    // ball track gets a lacquer sheen (light from the upper left).
    ctx.fillStyle = radial(ctx, c, c, rPocketIn, rPocketOut, [[0, 'rgba(0,0,0,0.5)'], [0.45, 'rgba(0,0,0,0.12)'], [1, 'rgba(0,0,0,0)']]);
    ctx.beginPath();
    ctx.arc(c, c, rPocketOut, 0, Math.PI * 2);
    ctx.arc(c, c, rPocketIn, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,200,0.35)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(c, c, (rOuter + rTrack) / 2, Math.PI * 1.02, Math.PI * 1.55);
    ctx.stroke();
    ctx.fillStyle = radial(ctx, c - rCone * 0.35, c - rCone * 0.4, 0, rCone * 0.8, [[0, 'rgba(255,236,190,0.45)'], [1, 'rgba(255,236,190,0)']]);
    ctx.beginPath();
    ctx.arc(c, c, rCone, 0, Math.PI * 2);
    ctx.fill();
    // Turret with four arms
    ctx.fillStyle = linear(ctx, c - 20, c - 20, c + 20, c + 20, GOLD);
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate((i * Math.PI) / 2 + Math.PI / 4);
      roundRect(ctx, -1.6, -rCone + 6, 3.2, rCone - 10, 1.6);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -rCone + 6, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = radial(ctx, c, c, 0, 8, [
      [0, '#fff7d6'],
      [0.5, '#f2c14e'],
      [1, '#8a5a12'],
    ], c - 2, c - 3);
    ctx.beginPath();
    ctx.arc(c, c, 8, 0, Math.PI * 2);
    ctx.fill();
  });
  // Static glass reflection drawn over the spinning wheel.
  hdTexture(scene, 'roulette-gloss', WHEEL_SIZE, WHEEL_SIZE, (ctx) => {
    const c = WHEEL_SIZE / 2;
    ctx.fillStyle = linear(ctx, 0, 0, WHEEL_SIZE, WHEEL_SIZE, [
      [0, 'rgba(255,255,255,0.22)'],
      [0.45, 'rgba(255,255,255,0)'],
      [1, 'rgba(0,0,0,0.25)'],
    ]);
    ctx.beginPath();
    ctx.arc(c, c, c - 1, 0, Math.PI * 2);
    ctx.fill();
  });
  hdTexture(scene, 'roulette-ball', 7, 7, (ctx) => {
    ctx.fillStyle = radial(ctx, 3.5, 3.5, 0, 3.4, [
      [0, '#ffffff'],
      [0.55, '#ecebf3'],
      [1, '#7d7a92'],
    ], 2.3, 2.1);
    ctx.beginPath();
    ctx.arc(3.5, 3.5, 3.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(2.5, 2.3, 0.9, 0, Math.PI * 2);
    ctx.fill();
  });
  // Static mahogany bowl around the spinning wheel (V7.1 2.5D): bevelled wood, gold lips and eight
  // diamond deflectors; drawn under the wheel so only its outer band shows.
  const B = WHEEL_SIZE + 22;
  hdTexture(scene, 'roulette-bowl', B, B, (ctx) => {
    const c = B / 2;
    const rOut = c - 2;
    ctx.fillStyle = radial(ctx, c + 3, c + 6, rOut * 0.7, rOut + 2, [[0, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']]);
    ctx.beginPath();
    ctx.arc(c + 3, c + 6, rOut + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = radial(ctx, c, c, WHEEL_SIZE / 2 - 4, rOut, [[0, '#1c0c03'], [0.45, '#6b3713'], [0.8, '#a2622c'], [1, '#3a1d0b']], c - 6, c - 8);
    ctx.beginPath();
    ctx.arc(c, c, rOut, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = linear(ctx, 0, 0, B, B, GOLD);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(c, c, rOut - 0.9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(c, c, WHEEL_SIZE / 2 + 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,230,190,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c, c, rOut - 4, Math.PI * 1.05, Math.PI * 1.6);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const rr = (rOut + WHEEL_SIZE / 2) / 2 + 1;
      ctx.save();
      ctx.translate(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = linear(ctx, -3, -2, 3, 2, GOLD);
      ctx.beginPath();
      ctx.moveTo(0, -3.4);
      ctx.lineTo(2, 0);
      ctx.lineTo(0, 3.4);
      ctx.lineTo(-2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  });
}

// ---------------------------------------------------------------- slot symbols

export const SYMBOL_SIZE = 46;

function withShadow(ctx: Ctx, fn: () => void) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1.5;
  fn();
  ctx.restore();
}

function gloss(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = -0.5) {
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

const SYMBOL_PAINTERS: Record<SlotSymbol, (ctx: Ctx) => void> = {
  cherry(ctx) {
    ctx.strokeStyle = '#2f7d32';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(15, 28);
    ctx.quadraticCurveTo(18, 14, 28, 8);
    ctx.moveTo(31, 30);
    ctx.quadraticCurveTo(29, 18, 28, 8);
    ctx.stroke();
    ctx.fillStyle = linear(ctx, 26, 4, 40, 14, [[0, '#7ddc6a'], [1, '#2f7d32']]);
    ctx.beginPath();
    ctx.ellipse(34, 9, 7, 3.5, -0.4, 0, Math.PI * 2);
    ctx.fill();
    for (const [x, y] of [
      [14, 32],
      [31, 34],
    ] as const) {
      withShadow(ctx, () => {
        ctx.fillStyle = radial(ctx, x, y, 0, 9.5, [[0, '#ff6b7a'], [0.6, '#d3102c'], [1, '#6e0614']], x - 3, y - 3);
        ctx.beginPath();
        ctx.arc(x, y, 9.5, 0, Math.PI * 2);
        ctx.fill();
      });
      gloss(ctx, x - 3.5, y - 3.5, 3, 1.8);
    }
  },
  lemon(ctx) {
    withShadow(ctx, () => {
      ctx.fillStyle = radial(ctx, 23, 23, 0, 18, [[0, '#fff7a8'], [0.6, '#ffd21f'], [1, '#c98a00']], 18, 17);
      ctx.beginPath();
      ctx.ellipse(23, 24, 17, 12.5, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(39, 18, 3, 2, -0.35, 0, Math.PI * 2);
      ctx.ellipse(7, 30, 3, 2, -0.35, 0, Math.PI * 2);
      ctx.fill();
    });
    gloss(ctx, 17, 18, 6, 2.5);
  },
  bell(ctx) {
    withShadow(ctx, () => {
      ctx.fillStyle = linear(ctx, 8, 0, 38, 0, GOLD);
      ctx.beginPath();
      ctx.moveTo(23, 5);
      ctx.bezierCurveTo(33, 5, 34, 16, 35, 26);
      ctx.quadraticCurveTo(36, 33, 41, 36);
      ctx.lineTo(5, 36);
      ctx.quadraticCurveTo(10, 33, 11, 26);
      ctx.bezierCurveTo(12, 16, 13, 5, 23, 5);
      ctx.fill();
      ctx.fillStyle = '#9c6a12';
      roundRect(ctx, 4, 35, 38, 4, 2);
      ctx.fill();
      ctx.fillStyle = radial(ctx, 23, 41, 0, 4, [[0, '#fff1b8'], [1, '#b9801c']]);
      ctx.beginPath();
      ctx.arc(23, 41, 3.6, 0, Math.PI * 2);
      ctx.fill();
    });
    gloss(ctx, 17, 15, 2.5, 7, 0.1);
  },
  clover(ctx) {
    withShadow(ctx, () => {
      ctx.strokeStyle = '#17643a';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(23, 24);
      ctx.quadraticCurveTo(26, 36, 33, 42);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.translate(23, 22);
        ctx.rotate((i * Math.PI) / 2);
        ctx.fillStyle = radial(ctx, 0, -9, 0, 11, [[0, '#7ff0a8'], [0.7, '#1fae5e'], [1, '#0b5e31']], -2, -12);
        heart(ctx, 0, -9, 15);
        ctx.restore();
      }
    });
  },
  diamond(ctx) {
    withShadow(ctx, () => {
      const top = 12;
      const mid = 20;
      ctx.fillStyle = '#5fd6ff';
      ctx.beginPath();
      ctx.moveTo(12, top);
      ctx.lineTo(34, top);
      ctx.lineTo(42, mid);
      ctx.lineTo(23, 42);
      ctx.lineTo(4, mid);
      ctx.closePath();
      ctx.fill();
    });
    const facets: [string, number[]][] = [
      ['#c9f4ff', [12, 12, 18, 20, 4, 20]],
      ['#8fe6ff', [12, 12, 34, 12, 28, 20, 18, 20]],
      ['#47c2ef', [34, 12, 42, 20, 28, 20]],
      ['#2a9fd6', [4, 20, 18, 20, 23, 42]],
      ['#6fd8ff', [18, 20, 28, 20, 23, 42]],
      ['#1a7fb8', [28, 20, 42, 20, 23, 42]],
    ];
    for (const [color, pts] of facets) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(pts[0]!, pts[1]!);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(15, 9);
    ctx.lineTo(16, 12);
    ctx.lineTo(19, 13);
    ctx.lineTo(16, 14);
    ctx.lineTo(15, 17);
    ctx.lineTo(14, 14);
    ctx.lineTo(11, 13);
    ctx.lineTo(14, 12);
    ctx.closePath();
    ctx.fill();
  },
  seven(ctx) {
    ctx.font = `900 44px ${FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    withShadow(ctx, () => {
      ctx.lineWidth = 4;
      ctx.strokeStyle = linear(ctx, 0, 4, 0, 42, GOLD);
      ctx.strokeText('7', 23, 25);
    });
    ctx.fillStyle = linear(ctx, 0, 6, 0, 42, [[0, '#ff6b6b'], [0.5, '#e01b2f'], [1, '#7a0614']]);
    ctx.fillText('7', 23, 25);
  },
  wild(ctx) {
    withShadow(ctx, () => {
      ctx.fillStyle = linear(ctx, 0, 2, 0, 44, GOLD);
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 21 : 9;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        ctx.lineTo(23 + Math.cos(a) * r, 22 + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    });
    ctx.fillStyle = linear(ctx, 0, 26, 0, 38, [[0, '#b45cff'], [1, '#5b1497']]);
    roundRect(ctx, 4, 27, 38, 12, 3);
    ctx.fill();
    ctx.strokeStyle = '#f7d77a';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 9px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('WILD', 23, 33.5);
  },
};

export function ensureSlotTextures(scene: Phaser.Scene) {
  for (const [name, paint] of Object.entries(SYMBOL_PAINTERS)) hdTexture(scene, `slot-${name}`, SYMBOL_SIZE, SYMBOL_SIZE, paint);
}

// ---------------------------------------------------------------- effects & props

export function ensureFxTextures(scene: Phaser.Scene) {
  hdTexture(scene, 'fx-glow', 24, 24, (ctx) => {
    ctx.fillStyle = radial(ctx, 12, 12, 0, 12, [
      [0, 'rgba(255,255,255,1)'],
      [0.3, 'rgba(255,236,170,0.6)'],
      [1, 'rgba(255,200,80,0)'],
    ]);
    ctx.fillRect(0, 0, 24, 24);
  });
  hdTexture(scene, 'fx-spark', 12, 12, (ctx) => {
    ctx.fillStyle = '#fff6d0';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.quadraticCurveTo(6.6, 5.4, 12, 6);
    ctx.quadraticCurveTo(6.6, 6.6, 6, 12);
    ctx.quadraticCurveTo(5.4, 6.6, 0, 6);
    ctx.quadraticCurveTo(5.4, 5.4, 6, 0);
    ctx.fill();
  });
  hdTexture(scene, 'fx-coin', 12, 12, (ctx) => {
    ctx.fillStyle = radial(ctx, 6, 6, 0, 6, [[0, '#fff1b8'], [0.6, '#f2c14e'], [1, '#8a5a12']], 4.5, 4);
    ctx.beginPath();
    ctx.arc(6, 6, 5.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(138,90,18,0.8)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(6, 6, 3.8, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/** Dealer shoe holding the deck. */
export function ensureShoeTexture(scene: Phaser.Scene) {
  hdTexture(scene, 'card-shoe', 70, 56, (ctx) => {
    withShadow(ctx, () => {
      ctx.fillStyle = linear(ctx, 0, 0, 0, 56, [[0, '#3a3550'], [1, '#14111f']]);
      ctx.beginPath();
      ctx.moveTo(6, 8);
      ctx.lineTo(64, 2);
      ctx.lineTo(68, 50);
      ctx.lineTo(2, 54);
      ctx.closePath();
      ctx.fill();
    });
    ctx.strokeStyle = linear(ctx, 0, 0, 70, 56, GOLD);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(10, 10, 50, 6);
  });
}

/**
 * Slot machine cabinet (V7.1 2.5D): plum lacquer body with a chrome-gold bevel, side pillars that
 * give it depth, an inner neon line and a recessed reel window. Same key / size as before.
 */
export function ensureSlotCabinet(scene: Phaser.Scene, w: number, h: number) {
  hdTexture(scene, 'slots-cabinet', w, h, (ctx) => {
    withShadow(ctx, () => {
      roundRect(ctx, 2, 4, w - 4, h - 6, 16);
      ctx.fillStyle = '#05030d';
      ctx.fill();
    });
    roundRect(ctx, 2, 2, w - 4, h - 6, 16);
    ctx.fillStyle = linear(ctx, 0, 0, 0, h, [[0, '#3a2468'], [0.45, '#1b1036'], [1, '#0a0618']]);
    ctx.fill();
    // Side pillars (depth).
    for (const x of [6, w - 18]) {
      roundRect(ctx, x, 14, 12, h - 34, 6);
      ctx.fillStyle = linear(ctx, x, 0, x + 12, 0, [[0, '#120a26'], [0.5, '#4a3285'], [1, '#120a26']]);
      ctx.fill();
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = linear(ctx, 0, 0, w, h, GOLD);
    roundRect(ctx, 3, 3, w - 6, h - 8, 15);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    roundRect(ctx, 5, 5, w - 10, h - 12, 13);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(190,90,255,0.65)';
    roundRect(ctx, 20, 10, w - 40, h - 22, 11);
    ctx.stroke();
    ctx.fillStyle = linear(ctx, 0, 0, 0, 40, [[0, 'rgba(255,255,255,0.16)'], [1, 'rgba(255,255,255,0)']]);
    roundRect(ctx, 8, 6, w - 16, 36, 11);
    ctx.fill();
  });
}

/**
 * Reel window overlay (V7.1 2.5D): the drums curve away at the top and bottom (shade), a highlight
 * band runs across the upper third, and a chrome frame sits around the window. Drawn over the reels.
 */
export function ensureSlotReelShade(scene: Phaser.Scene, w: number, h: number) {
  hdTexture(scene, 'slots-reelshade', w + 10, h + 10, (ctx) => {
    const x = 5;
    const y = 5;
    ctx.fillStyle = linear(ctx, 0, y, 0, y + h, [[0, 'rgba(10,6,24,0.62)'], [0.16, 'rgba(10,6,24,0.10)'], [0.3, 'rgba(255,255,255,0.10)'], [0.38, 'rgba(255,255,255,0)'], [0.84, 'rgba(10,6,24,0.10)'], [1, 'rgba(10,6,24,0.62)']]);
    ctx.fillRect(x, y, w, h);
    ctx.lineWidth = 4;
    ctx.strokeStyle = linear(ctx, 0, 0, w, h, [[0, '#f4f1ff'], [0.3, '#9a93b8'], [0.55, '#f2c14e'], [1, '#5c557a']]);
    roundRect(ctx, x - 2, y - 2, w + 4, h + 4, 8);
    ctx.stroke();
  });
  hdTexture(scene, 'slot-winframe', 46, 46, (ctx) => {
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = linear(ctx, 0, 0, 46, 46, GOLD);
    roundRect(ctx, 2, 2, 42, 42, 8);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    roundRect(ctx, 4.5, 4.5, 37, 37, 6);
    ctx.stroke();
  });
}

/**
 * Card back drawn from a cosmetic's colours (Poker, Liêng, Xì Tố). `royal` adds the Vương Giả crown.
 * Purely decorative: a back never reveals the card.
 */
export function ensureCardBackTexture(scene: Phaser.Scene, key: string, colors: string[], royal = false) {
  hdTexture(scene, key, CARD_W, CARD_H, (ctx) => {
    const W = CARD_W;
    const H = CARD_H;
    const [a = '#7a1630', b = '#3e0816', accent = '#f7d77a'] = colors.length >= 3 ? colors : [...colors, '#f7d77a'];
    roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 4);
    ctx.fillStyle = '#fbf7ee';
    ctx.fill();
    roundRect(ctx, 2, 2, W - 4, H - 4, 3.5);
    ctx.fillStyle = linear(ctx, 0, 0, W, H, [
      [0, b],
      [1, a],
    ]);
    ctx.fill();
    ctx.save();
    roundRect(ctx, 4, 4, W - 8, H - 8, 2.5);
    ctx.clip();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 0.5;
    for (let i = -H; i < W + H; i += 4) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + H, H);
      ctx.moveTo(i + H, 0);
      ctx.lineTo(i, H);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = royal ? linear(ctx, 0, 0, W, H, GOLD) : accent;
    ctx.lineWidth = royal ? 1.4 : 0.9;
    roundRect(ctx, 4, 4, W - 8, H - 8, 2.5);
    ctx.stroke();
    if (royal) {
      ctx.fillStyle = '#2a0613';
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = linear(ctx, W / 2 - 8, H / 2 - 6, W / 2 + 8, H / 2 + 6, GOLD);
      ctx.beginPath();
      ctx.moveTo(W / 2 - 7, H / 2 + 4);
      ctx.lineTo(W / 2 - 8, H / 2 - 4);
      ctx.lineTo(W / 2 - 3.5, H / 2);
      ctx.lineTo(W / 2, H / 2 - 6);
      ctx.lineTo(W / 2 + 3.5, H / 2);
      ctx.lineTo(W / 2 + 8, H / 2 - 4);
      ctx.lineTo(W / 2 + 7, H / 2 + 4);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = accent;
      diamondSuit(ctx, W / 2, H / 2, 16);
    }
  });
}

// ---------------------------------------------------------------- cosmetics (table skins, card backs)

/** Background texture for the viewer's table skin and the scene's layout (one per skin + layout). */
export function ensureSkinBackground(scene: Phaser.Scene, skinId: string, layout: TableLayout, oval?: OvalGeometry, w = WORLD_W, h = WORLD_H): string {
  const key = `skin-bg:${skinId}:${layout}:${w}x${h}:${oval ? `${oval.cx},${oval.cy},${oval.rx},${oval.ry}` : ''}`;
  hdTexture(scene, key, w, h, (ctx) => paintTable(ctx, w, h, skinId, layout, oval));
  return key;
}

/** Texture of a Frame-Library card back (seasonal backs). */
export function ensureLibraryCardBack(scene: Phaser.Scene, key: string, art: CardBackArt) {
  hdTexture(scene, key, CARD_W, CARD_H, (ctx) => paintCardBack(ctx, CARD_W, CARD_H, art));
}
