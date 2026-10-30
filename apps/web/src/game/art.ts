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

function hdTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx) => void) {
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

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function linear(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

function radial(ctx: Ctx, x: number, y: number, r0: number, r1: number, stops: [number, string][], fx = x, fy = y) {
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
      roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 4);
      ctx.fillStyle = linear(ctx, 0, 0, W, H, [
        [0, '#7a1630'],
        [1, '#3e0816'],
      ]);
      ctx.fill();
      ctx.save();
      roundRect(ctx, 4, 4, W - 8, H - 8, 2.5);
      ctx.clip();
      ctx.strokeStyle = 'rgba(247,215,122,0.35)';
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
      ctx.strokeStyle = linear(ctx, 0, 0, W, H, GOLD);
      ctx.lineWidth = 1;
      roundRect(ctx, 4, 4, W - 8, H - 8, 2.5);
      ctx.stroke();
      ctx.fillStyle = linear(ctx, W / 2 - 8, H / 2 - 8, W / 2 + 8, H / 2 + 8, GOLD);
      diamondSuit(ctx, W / 2, H / 2, 18);
      return;
    }
    const rank = card.slice(0, -1);
    const suit = card.slice(-1);
    const red = suit === 'H' || suit === 'D';
    const ink = red ? '#c8102e' : '#16142b';

    roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 4);
    ctx.fillStyle = linear(ctx, 0, 0, W, H, [
      [0, '#ffffff'],
      [1, '#efe9dc'],
    ]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    const corner = (flip: boolean) => {
      ctx.save();
      if (flip) {
        ctx.translate(W, H);
        ctx.rotate(Math.PI);
      }
      ctx.fillStyle = ink;
      ctx.font = `700 ${rank === '10' ? 10 : 11}px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(rank, 7.5, 3);
      drawSuit(ctx, suit, 7.5, 18.5, 7);
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

// ---------------------------------------------------------------- chips

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

export function ensureChipTextures(scene: Phaser.Scene) {
  for (const [value, c] of Object.entries(CHIP_STYLES)) {
    hdTexture(scene, `chip-${value}`, CHIP_SIZE, CHIP_SIZE + 3, (ctx) => {
      const r = CHIP_SIZE / 2 - 1;
      const cx = CHIP_SIZE / 2;
      const cy = CHIP_SIZE / 2;
      // Edge thickness (gives the chip depth)
      ctx.fillStyle = c.dark;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2.5, r, r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = radial(ctx, cx, cy, 2, r, [
        [0, c.base],
        [0.85, c.base],
        [1, c.dark],
      ], cx - 4, cy - 5);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      // Edge inserts
      ctx.fillStyle = c.insert;
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((i * Math.PI) / 3);
        roundRect(ctx, -2.6, -r + 0.6, 5.2, 4.2, 1);
        ctx.fill();
        ctx.restore();
      }
      // Inner ring
      ctx.strokeStyle = c.insert;
      ctx.globalAlpha = 0.7;
      ctx.setLineDash([2, 1.5]);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.66, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = radial(ctx, cx, cy, 0, r * 0.6, [
        [0, c.base],
        [1, c.dark],
      ], cx - 2, cy - 3);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c.text;
      ctx.font = `800 ${value.length > 3 ? 6.5 : 8}px ${FONT_UI}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Number(value) >= 1000 ? `${Number(value) / 1000}K` : value, cx, cy + 0.5);
      // Gloss
      ctx.fillStyle = linear(ctx, 0, cy - r, 0, cy, [
        [0, 'rgba(255,255,255,0.45)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
      ctx.beginPath();
      ctx.ellipse(cx, cy - r * 0.45, r * 0.8, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

// ---------------------------------------------------------------- dice

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

export const DIE_SIZE = 34;

export function ensureDiceTextures(scene: Phaser.Scene) {
  for (let face = 1; face <= 6; face++) {
    hdTexture(scene, `die-${face}`, DIE_SIZE + 4, DIE_SIZE + 4, (ctx) => {
      const s = DIE_SIZE;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetY = 2;
      roundRect(ctx, 1, 1, s, s, 7);
      ctx.fillStyle = linear(ctx, 0, 0, s, s, [
        [0, '#ffffff'],
        [0.7, '#ece7f5'],
        [1, '#c9c1da'],
      ]);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = radial(ctx, s * 0.35, s * 0.3, 0, s * 0.6, [
        [0, 'rgba(255,255,255,0.8)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
      roundRect(ctx, 1, 1, s, s, 7);
      ctx.fill();
      // Asian dice: the 1 and 4 pips are red.
      const red = face === 1 || face === 4;
      for (const [dx, dy] of PIPS[face]!) {
        const x = 1 + s / 2 + dx * s * 0.27;
        const y = 1 + s / 2 + dy * s * 0.27;
        const pr = face === 1 ? 5 : 3;
        ctx.fillStyle = radial(ctx, x, y, 0, pr, red ? [[0, '#ff5a6e'], [1, '#a00d24']] : [[0, '#4a4670'], [1, '#0e0c1f']], x - 1, y - 1);
        ctx.beginPath();
        ctx.arc(x, y, pr, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
}

/**
 * Traditional Tài Xỉu cover seen from above: a black lacquered dome over the dice plate, a thin
 * gold rim, the turned foot ring at the top of the dome, a soft highlight from the upper left and
 * a contact shadow on the felt. Square so it can rotate while shaking.
 */
export const BOWL_W = 168;
export const BOWL_H = 168;
export const BOWL_R = 72;

export function ensureBowlTexture(scene: Phaser.Scene) {
  hdTexture(scene, 'taixiu-bowl', BOWL_W, BOWL_H, (ctx) => {
    const cx = BOWL_W / 2;
    const cy = BOWL_H / 2;
    const r = BOWL_R;
    // Contact shadow on the felt (light comes from the upper left).
    ctx.fillStyle = radial(ctx, cx + 5, cy + 7, r * 0.7, r + 10, [
      [0, 'rgba(0,0,0,0.55)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    ctx.beginPath();
    ctx.arc(cx + 5, cy + 7, r + 10, 0, Math.PI * 2);
    ctx.fill();
    // Lacquered dome: lighter where it faces the light, near-black towards the rim.
    ctx.fillStyle = radial(
      ctx,
      cx,
      cy,
      0,
      r,
      [
        [0, '#4b4651'],
        [0.35, '#24202a'],
        [0.75, '#0e0c11'],
        [1, '#050406'],
      ],
      cx - r * 0.32,
      cy - r * 0.36,
    );
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // Thin gold rim and a fine inner gold line.
    ctx.strokeStyle = linear(ctx, cx - r, cy - r, cx + r, cy + r, GOLD);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Turned foot ring at the top of the inverted bowl.
    const fr = 22;
    ctx.fillStyle = radial(ctx, cx, cy, 0, fr, [
      [0, '#2c2830'],
      [1, '#0b0a0d'],
    ], cx - 6, cy - 7);
    ctx.beginPath();
    ctx.arc(cx, cy, fr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = linear(ctx, cx - fr, cy - fr, cx + fr, cy + fr, GOLD);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, fr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, fr - 4, 0, Math.PI * 2);
    ctx.stroke();
    // Glossy highlights: a broad soft reflection and a crisp arc along the lit edge.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = radial(ctx, cx - r * 0.38, cy - r * 0.42, 0, r * 0.55, [
      [0, 'rgba(255,255,255,0.32)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.36, cy - r * 0.4, r * 0.5, r * 0.28, -0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r - 5, Math.PI * 1.05, Math.PI * 1.45);
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
      [0.6, '#e6e6ee'],
      [1, '#8c8aa0'],
    ], 2.4, 2.2);
    ctx.beginPath();
    ctx.arc(3.5, 3.5, 3.3, 0, Math.PI * 2);
    ctx.fill();
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

/** Glossy machine frame around the slot reels. */
export function ensureSlotCabinet(scene: Phaser.Scene, w: number, h: number) {
  hdTexture(scene, 'slots-cabinet', w, h, (ctx) => {
    withShadow(ctx, () => {
      roundRect(ctx, 2, 2, w - 4, h - 4, 16);
      ctx.fillStyle = linear(ctx, 0, 0, 0, h, [[0, '#2a1f4f'], [0.5, '#130e2b'], [1, '#08061a']]);
      ctx.fill();
    });
    ctx.lineWidth = 3;
    ctx.strokeStyle = linear(ctx, 0, 0, w, h, GOLD);
    roundRect(ctx, 3, 3, w - 6, h - 6, 15);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(190,90,255,0.6)';
    roundRect(ctx, 8, 8, w - 16, h - 16, 11);
    ctx.stroke();
    ctx.fillStyle = linear(ctx, 0, 0, 0, 40, [[0, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]);
    roundRect(ctx, 8, 8, w - 16, 36, 11);
    ctx.fill();
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
export function ensureSkinBackground(scene: Phaser.Scene, skinId: string, layout: TableLayout, oval?: OvalGeometry): string {
  const key = `skin-bg:${skinId}:${layout}:${oval ? `${oval.cx},${oval.cy},${oval.rx},${oval.ry}` : ''}`;
  hdTexture(scene, key, WORLD_W, WORLD_H, (ctx) => paintTable(ctx, WORLD_W, WORLD_H, skinId, layout, oval));
  return key;
}

/** Texture of a Frame-Library card back (seasonal backs). */
export function ensureLibraryCardBack(scene: Phaser.Scene, key: string, art: CardBackArt) {
  hdTexture(scene, key, CARD_W, CARD_H, (ctx) => paintCardBack(ctx, CARD_W, CARD_H, art));
}
