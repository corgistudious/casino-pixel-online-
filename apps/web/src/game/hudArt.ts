import Phaser from 'phaser';
import { hdTexture, linear, radial, roundRect } from './art';
import { FONT_UI } from './hd';

/**
 * V7.1 "Game Center 2.5D" HUD kit for the Phaser tables, drawn procedurally at RES× (sharp on
 * Retina, nothing downloaded): metallic avatar rings, glass name plates with a gold bevel, the pot
 * plate and the dealer button. Purple / gold / emerald palette shared with premium.css.
 */
export const RING = 52;
export const PLATE_W = 96;
export const PLATE_H = 32;
export const POT_W = 132;
export const POT_H = 30;

const GOLD_STOPS: [number, string][] = [
  [0, '#fff3c4'],
  [0.25, '#f2c14e'],
  [0.5, '#8a5a12'],
  [0.75, '#f7d77a'],
  [1, '#b9801c'],
];

/** Gold avatar ring (variants: gold, turn = cyan glow, win = bright gold glow, vip = violet gems). */
export function ensureAvatarRings(scene: Phaser.Scene) {
  const variants: Record<string, { glow: string | null; gem: string }> = {
    'ring-gold': { glow: null, gem: '#f2c14e' },
    'ring-turn': { glow: 'rgba(90,216,255,0.85)', gem: '#5ad8ff' },
    'ring-win': { glow: 'rgba(255,224,138,0.95)', gem: '#fff1b8' },
    'ring-vip': { glow: null, gem: '#c79bff' },
  };
  for (const [key, v] of Object.entries(variants)) {
    hdTexture(scene, key, RING, RING, (ctx) => {
      const c = RING / 2;
      if (v.glow) {
        ctx.fillStyle = radial(ctx, c, c, c * 0.6, c, [
          [0, v.glow],
          [1, 'rgba(0,0,0,0)'],
        ]);
        ctx.beginPath();
        ctx.arc(c, c, c, 0, Math.PI * 2);
        ctx.fill();
      }
      // Drop shadow under the ring.
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.arc(c, c + 1.5, 20.5, 0, Math.PI * 2);
      ctx.fill();
      // Metallic ring (outer bevel, body, inner bevel).
      ctx.lineWidth = 4.2;
      ctx.strokeStyle = linear(ctx, 0, 0, RING, RING, GOLD_STOPS);
      ctx.beginPath();
      ctx.arc(c, c, 18.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = 'rgba(255,248,220,0.95)';
      ctx.beginPath();
      ctx.arc(c, c, 20.8, Math.PI * 1.05, Math.PI * 1.85);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(60,30,0,0.6)';
      ctx.beginPath();
      ctx.arc(c, c, 16.4, 0, Math.PI * 2);
      ctx.stroke();
      // Four gems on the ring.
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 2;
        const gx = c + Math.cos(a) * 18.6;
        const gy = c + Math.sin(a) * 18.6;
        ctx.fillStyle = radial(ctx, gx - 0.5, gy - 0.6, 0.2, 2.2, [
          [0, '#ffffff'],
          [0.4, v.gem],
          [1, 'rgba(0,0,0,0.6)'],
        ]);
        ctx.beginPath();
        ctx.arc(gx, gy, 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
}

/** Name plate: dark plum glass, gold bevel, top light. */
export function ensureNamePlate(scene: Phaser.Scene) {
  for (const [key, edge] of [
    ['plate', GOLD_STOPS],
    ['plate-me', [[0, '#fff8d8'], [0.5, '#ffd86b'], [1, '#c88d24']] as [number, string][]],
  ] as const) {
    hdTexture(scene, key, PLATE_W, PLATE_H, (ctx) => {
      roundRect(ctx, 1, 1.5, PLATE_W - 2, PLATE_H - 3, 9);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fill();
      roundRect(ctx, 1.5, 1, PLATE_W - 3, PLATE_H - 3.5, 8.5);
      ctx.fillStyle = linear(ctx, 0, 0, 0, PLATE_H, [
        [0, '#3a2468'],
        [0.5, '#1b1036'],
        [1, '#0c0720'],
      ]);
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = linear(ctx, 0, 0, PLATE_W, PLATE_H, edge as [number, string][]);
      ctx.stroke();
      ctx.fillStyle = linear(ctx, 0, 1, 0, PLATE_H / 2, [
        [0, 'rgba(255,255,255,0.22)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
      roundRect(ctx, 3, 2.5, PLATE_W - 6, PLATE_H / 2 - 2, 7);
      ctx.fill();
    });
  }
}

/** Pot plate: a dark emerald pill with a gold rim (the chips and amount are drawn on top). */
export function ensurePotPlate(scene: Phaser.Scene) {
  hdTexture(scene, 'pot-plate', POT_W, POT_H, (ctx) => {
    roundRect(ctx, 1, 2, POT_W - 2, POT_H - 3, POT_H / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fill();
    roundRect(ctx, 1.5, 1, POT_W - 3, POT_H - 3.5, (POT_H - 3.5) / 2);
    ctx.fillStyle = linear(ctx, 0, 0, 0, POT_H, [
      [0, '#0f5a3e'],
      [1, '#06261b'],
    ]);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = linear(ctx, 0, 0, POT_W, POT_H, GOLD_STOPS);
    ctx.stroke();
  });
}

/** Dealer button: domed gold disc with an engraved "D". */
export function ensureDealerButton(scene: Phaser.Scene) {
  hdTexture(scene, 'dealer-btn', 20, 20, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.arc(10, 11, 8.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = radial(ctx, 7.5, 6.5, 0.5, 10, [
      [0, '#fff7d6'],
      [0.45, '#f2c14e'],
      [1, '#8a5a12'],
    ]);
    ctx.beginPath();
    ctx.arc(10, 10, 8.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a3a06';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.fillStyle = '#3a2405';
    ctx.font = `900 10px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('D', 10, 10.6);
  });
}

export function ensureHudKit(scene: Phaser.Scene) {
  ensureAvatarRings(scene);
  ensureNamePlate(scene);
  ensurePotPlate(scene);
  ensureDealerButton(scene);
}
