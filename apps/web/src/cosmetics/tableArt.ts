import { cosmeticDef, DEFAULT_TABLE_SKIN, type TableSkinArt } from '@casino/shared';
import { drawGlyph } from '../ui/glyphs';

/**
 * Original table-skin artwork drawn on a 2D canvas (same code for the Phaser game backgrounds and
 * the shop preview). A skin changes only pixels: felt, pattern, rail material, lights and printed
 * lines. Every game layout keeps its own geometry, so hit areas, bet spots, cards and timers never
 * move:
 *  - 'oval'  Poker, Liêng, Xì Tố: the oval card table around (cx, cy).
 *  - 'arc'   Blackjack: dealer arcs at the top and a padded rail at the bottom.
 *  - 'board' Tài Xỉu, Sic Bo, Roulette: a framed felt behind the bowl/wheel and the betting board.
 */
export type TableLayout = 'oval' | 'arc' | 'board';
export interface OvalGeometry {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

type Ctx = CanvasRenderingContext2D;

function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100_000) / 100_000;
  };
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Felt base: radial gradient, fibre noise and the skin's printed pattern, clipped to `clip`. */
function felt(ctx: Ctx, w: number, h: number, s: TableSkinArt, seed: string, clip?: (ctx: Ctx) => void) {
  ctx.save();
  if (clip) {
    ctx.beginPath();
    clip(ctx);
    ctx.clip();
  }
  const g = ctx.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h * 0.5, Math.max(w, h) * 0.75);
  g.addColorStop(0, s.felt[0]);
  g.addColorStop(0.55, s.felt[1]);
  g.addColorStop(1, s.felt[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const rnd = seeded(seed);
  for (let i = 0; i < (w * h) / 40; i++) {
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(rnd() * w, rnd() * h, 0.6, 0.6);
  }
  pattern(ctx, w, h, s, rnd);
  ctx.restore();
}

function pattern(ctx: Ctx, w: number, h: number, s: TableSkinArt, rnd: () => number) {
  const line = hexA(s.line, 0.1);
  ctx.save();
  switch (s.pattern) {
    case 'diamond': {
      ctx.strokeStyle = line;
      ctx.lineWidth = 0.7;
      const step = 26;
      for (let x = -h; x < w + h; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + h, h);
        ctx.moveTo(x + h, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = step / 2; y < h; y += step) for (let x = (y / step) % 2 ? step : step / 2; x < w; x += step) drawGlyph(ctx, 'diamond', x, y, 5, hexA(s.accent, 0.12));
      break;
    }
    case 'damask': {
      const step = 46;
      for (let row = 0, y = 12; y < h + step; y += step * 0.75, row++) {
        for (let x = row % 2 ? step / 2 : 0; x < w + step; x += step) {
          drawGlyph(ctx, s.motif, x, y, 18, hexA(s.line, 0.09));
          ctx.strokeStyle = hexA(s.line, 0.08);
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(x, y, 15, 0.2, Math.PI - 0.2);
          ctx.stroke();
        }
      }
      break;
    }
    case 'lattice': {
      ctx.strokeStyle = hexA(s.line, 0.12);
      ctx.lineWidth = 0.6;
      for (let x = 0; x < w; x += 18) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 18) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      for (let i = 0; i < 40; i++) drawGlyph(ctx, 'star', Math.round((rnd() * w) / 18) * 18, Math.round((rnd() * h) / 18) * 18, 4, hexA(s.accent, 0.35));
      break;
    }
    case 'scatter': {
      for (let i = 0; i < (w * h) / 5200; i++) drawGlyph(ctx, s.motif, rnd() * w, rnd() * h, 7 + rnd() * 9, hexA(s.line, 0.06 + rnd() * 0.07), (rnd() - 0.5) * 1.2);
      break;
    }
    case 'waves': {
      ctx.strokeStyle = hexA(s.line, 0.1);
      ctx.lineWidth = 1;
      for (let y = 8; y < h; y += 16) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 6) ctx.lineTo(x, y + Math.sin(x / 22 + y) * 4);
        ctx.stroke();
      }
      break;
    }
    case 'rays': {
      ctx.translate(w / 2, h * 0.45);
      for (let i = 0; i < 36; i++) {
        ctx.rotate((Math.PI * 2) / 36);
        ctx.fillStyle = hexA(s.line, i % 2 ? 0.04 : 0.07);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.max(w, h), -14);
        ctx.lineTo(Math.max(w, h), 14);
        ctx.fill();
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

/** A rail band in the skin's material, along `path` (stroked with `width`). */
function rail(main: Ctx, s: TableSkinArt, path: (ctx: Ctx) => void, width: number, w: number, h: number, seed: string) {
  // Shadow on the table, then the band drawn on its own layer so its material (grain, veins,
  // frost…) stays inside the band and never spills onto the felt.
  main.save();
  main.lineJoin = 'round';
  main.beginPath();
  path(main);
  main.strokeStyle = 'rgba(0,0,0,0.55)';
  main.lineWidth = width + 4;
  main.stroke();
  main.restore();
  const off = document.createElement('canvas');
  off.width = main.canvas.width;
  off.height = main.canvas.height;
  const ctx = off.getContext('2d')!;
  ctx.setTransform(main.getTransform());
  const g = ctx.createLinearGradient(0, 0, w, h);
  const [light, dark] = s.rail;
  const stops: [number, string][] =
    s.railStyle === 'chrome'
      ? [[0, light], [0.25, dark], [0.5, light], [0.75, dark], [1, light]]
      : s.railStyle === 'gold'
        ? [[0, light], [0.35, hexMix(light, dark)], [0.6, dark], [0.85, light], [1, hexMix(light, dark)]]
        : [[0, light], [0.5, dark], [1, light]];
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.lineJoin = 'round';
  ctx.beginPath();
  path(ctx);
  ctx.strokeStyle = g;
  ctx.lineWidth = width;
  ctx.stroke();
  // Material detail, only on the band's pixels.
  ctx.globalCompositeOperation = 'source-atop';
  const rnd = seeded(seed + s.railStyle);
  if (s.railStyle === 'wood') {
    for (let i = 0; i < 220; i++) {
      ctx.strokeStyle = `rgba(0,0,0,${0.1 + rnd() * 0.12})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      const y = rnd() * h;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y + rnd() * 10 - 5, w * 0.7, y + rnd() * 10 - 5, w, y);
      ctx.stroke();
    }
  } else if (s.railStyle === 'marble') {
    for (let i = 0; i < 60; i++) {
      ctx.strokeStyle = i % 4 === 0 ? 'rgba(212,170,70,0.7)' : 'rgba(80,80,80,0.22)';
      ctx.lineWidth = i % 4 === 0 ? 0.9 : 0.6;
      ctx.beginPath();
      let x = rnd() * w;
      let y = rnd() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (rnd() - 0.3) * 40;
        y += (rnd() - 0.5) * 30;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (s.railStyle === 'ice') {
    for (let i = 0; i < 240; i++) drawGlyph(ctx, i % 6 === 0 ? 'snowflake' : 'star', rnd() * w, rnd() * h, i % 6 === 0 ? 7 : 2.5, 'rgba(255,255,255,0.75)');
  } else if (s.railStyle === 'coral') {
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.12 + rnd() * 0.22})`;
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, 0.6 + rnd() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (s.railStyle === 'lacquer') {
    const sheen = ctx.createLinearGradient(0, 0, 0, h);
    sheen.addColorStop(0, 'rgba(255,255,255,0.18)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalCompositeOperation = 'source-over';
  if (s.railStyle === 'velvet') {
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = hexA(s.accent, 0.6);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    path(ctx);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Inlay line on precious rails.
  if (s.railStyle === 'gold' || s.railStyle === 'lacquer' || s.railStyle === 'marble' || s.railStyle === 'chrome') {
    ctx.beginPath();
    path(ctx);
    ctx.strokeStyle = s.railStyle === 'lacquer' ? hexA(s.line, 0.9) : 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  main.save();
  main.setTransform(1, 0, 0, 1, 0, 0);
  main.drawImage(off, 0, 0);
  main.restore();
}

function hexMix(a: string, b: string) {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const m = (s: number) => Math.round((((x >> s) & 255) + ((y >> s) & 255)) / 2);
  return `rgb(${m(16)},${m(8)},${m(0)})`;
}

function lights(ctx: Ctx, w: number, h: number, s: TableSkinArt) {
  const xs = s.lights === 1 ? [w / 2] : s.lights === 2 ? [w * 0.32, w * 0.68] : [w * 0.22, w / 2, w * 0.78];
  for (const x of xs) {
    const g = ctx.createRadialGradient(x, h * 0.3, 0, x, h * 0.3, h * 0.6);
    g.addColorStop(0, hexA(s.glow, 0.16));
    g.addColorStop(1, hexA(s.glow, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

function vignette(ctx: Ctx, w: number, h: number) {
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.45, w / 2, h / 2, w * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Paints a whole game background for a skin and layout onto a w×h canvas context. */
export function paintTable(ctx: Ctx, w: number, h: number, skinId: string | null | undefined, layout: TableLayout, oval?: OvalGeometry) {
  const def = cosmeticDef(skinId ?? '') ?? cosmeticDef(DEFAULT_TABLE_SKIN)!;
  const s = (def.kind === 'table_skin' ? def.art : (cosmeticDef(DEFAULT_TABLE_SKIN)!.art as TableSkinArt)) as TableSkinArt;
  const seed = `${def.id}:${layout}`;
  // Room around the table: the felt's darkest tone.
  ctx.fillStyle = s.felt[2];
  ctx.fillRect(0, 0, w, h);
  if (layout === 'oval') {
    const o = oval ?? { cx: w / 2, cy: h * 0.48, rx: w * 0.33, ry: h * 0.33 };
    felt(ctx, w, h, { ...s, felt: [hexMix(s.felt[1], s.felt[2]), s.felt[2], '#000000'], pattern: 'plain' }, seed + 'room');
    lights(ctx, w, h, s);
    const ellipse = (c: Ctx, k = 0) => c.ellipse(o.cx, o.cy, o.rx - k, o.ry - k, 0, 0, Math.PI * 2);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(o.cx + 3, o.cy + 7, o.rx + 4, o.ry + 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    felt(ctx, w, h, s, seed, (c) => ellipse(c, 12));
    // Centre watermark and printed line.
    drawGlyph(ctx, s.motif, o.cx, o.cy + o.ry * 0.38, o.ry * 0.34, hexA(s.line, 0.12));
    ctx.strokeStyle = hexA(s.line, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(o.cx, o.cy, o.rx * 0.82, o.ry * 0.72, 0, 0, Math.PI * 2);
    ctx.stroke();
    rail(ctx, s, (c) => ellipse(c, 0), 22, w, h, seed);
    ctx.strokeStyle = hexA(s.line, 0.9);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ellipse(ctx, 12);
    ctx.stroke();
  } else {
    felt(ctx, w, h, s, seed);
    lights(ctx, w, h, s);
    if (layout === 'arc') {
      ctx.strokeStyle = hexA(s.line, 0.8);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(w / 2, 20, 280, 210, 0, 0, Math.PI);
      ctx.stroke();
      ctx.strokeStyle = hexA(s.line, 0.45);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(w / 2, 20, 300, 235, 0, 0, Math.PI);
      ctx.stroke();
      drawGlyph(ctx, s.motif, w / 2, h * 0.52, 70, hexA(s.line, 0.08));
      rail(ctx, s, (c) => {
        c.moveTo(-10, h - 7);
        c.lineTo(w + 10, h - 7);
      }, 14, w, h, seed);
    } else {
      drawGlyph(ctx, s.motif, w * 0.24, h * 0.52, 90, hexA(s.line, 0.06));
      rail(ctx, s, (c) => c.rect(5, 5, w - 10, h - 10), 10, w, h, seed);
      // Corner ornaments.
      for (const [x, y] of [[16, 16], [w - 16, 16], [16, h - 16], [w - 16, h - 16]] as const) drawGlyph(ctx, s.motif, x, y, 13, hexA(s.accent, 0.9));
    }
  }
  vignette(ctx, w, h);
}

/** Line/accent colours of a skin for things a scene still draws itself (as 0xRRGGBB numbers). */
export function skinColors(skinId: string | null | undefined) {
  const def = cosmeticDef(skinId ?? '');
  const s = (def?.kind === 'table_skin' ? def.art : cosmeticDef(DEFAULT_TABLE_SKIN)!.art) as TableSkinArt;
  const num = (h: string) => parseInt(h.slice(1), 16);
  return { line: num(s.line), accent: num(s.accent), railLight: num(s.rail[0]), railDark: num(s.rail[1]), lineCss: s.line };
}
