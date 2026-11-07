import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COSMETIC_LIBRARY, FRAME_LIBRARY, SEASON_THEMES, SLOT_SYMBOLS, VIP_MAX } from '@casino/shared';
import { KEYO_ASSETS, type KeyoAssetId } from '../src/assets/keyo/registry.generated';
import { keyoUrlPx as loaderUrl } from '../src/assets/keyo';
import { ACHIEVEMENT_ART, eventArt, GIFT_ART, ITEM_ART, rewardChest, studioFelt, vipBadgeId, vipFrameId } from '../src/assets/keyo/bindings';
import { STUDIO_TEXTURES, resolveCanvasW, texturesForScene, ROULETTE_WHEEL_CANVAS_W } from '../src/game/assetTextures';
import integration from '../src/assets/keyo/integration.json';

const ids = Object.keys(KEYO_ASSETS) as KeyoAssetId[];
const has = (id: string) => Object.prototype.hasOwnProperty.call(KEYO_ASSETS, id);

// Catalog ids seeded by the server migrations (never created or changed by this integration).
const sqlDir = fileURLToPath(new URL('../../server/drizzle/', import.meta.url));
const seeded = new Set(
  readdirSync(sqlDir)
    .filter((f) => f.endsWith('.sql'))
    .flatMap((f) => [...readFileSync(sqlDir + f, 'utf8').matchAll(/^\s*\('([a-z0-9_]+)', '(frame|avatar|title|chat_bubble|card_back|table_skin|victory_effect|collectible)'/gm)].map((m) => m[1]!)),
);

describe('Keyo asset registry & loader', () => {
  it('holds the 270 approved assets with several sizes each', () => {
    expect(ids.length).toBe(270);
    for (const id of ids) expect(Object.keys(KEYO_ASSETS[id].files).length).toBeGreaterThanOrEqual(2);
  });

  it('picks the smallest variant that covers the requested pixels (no 1024 px file for a 44 px icon)', () => {
    expect(loaderUrl('vip.badge.vip-05', 44)).toContain('.128.');
    expect(loaderUrl('vip.badge.vip-05', 200)).toContain('.256.');
    expect(loaderUrl('vip.badge.vip-05', 5000)).toContain('.512.');
    expect(loaderUrl('profile.header', 600)).toContain('.1024.');
  });
});

describe('bindings point at real assets and real catalog items', () => {
  it('VIP 1–15 badges, highest level keeps the top badge', () => {
    for (let l = 1; l <= VIP_MAX; l++) expect(has(vipBadgeId(l))).toBe(true);
    expect(vipBadgeId(40)).toBe('vip.badge.vip-15');
    expect(vipBadgeId(0)).toBe('vip.badge.vip-01');
  });

  it('VIP milestone frames follow the real level (5 / 7 / 10 / 15)', () => {
    expect(vipFrameId(4)).toBeNull();
    expect(vipFrameId(5)).toBe('frame.vip.vip-05');
    expect(vipFrameId(9)).toBe('frame.vip.vip-07');
    expect(vipFrameId(12)).toBe('frame.vip.vip-10');
    expect(vipFrameId(15)).toBe('frame.vip.vip-15');
  });

  it('every ITEM_ART key is a seeded catalog item and every value an asset of the right family', () => {
    const family: Record<string, string> = { chat_bubble: 'bubble.', title: 'title.', card_back: 'cardback.', frame: 'frame.' };
    for (const [itemId, asset] of Object.entries(ITEM_ART)) {
      expect(seeded.has(itemId), `${itemId} seeded`).toBe(true);
      expect(has(asset), asset).toBe(true);
      const kind = COSMETIC_LIBRARY.find((c) => c.id === itemId)?.kind ?? (FRAME_LIBRARY.some((f) => f.id === itemId) ? 'frame' : itemId.startsWith('bubble_') ? 'chat_bubble' : itemId.startsWith('title_') ? 'title' : 'card_back');
      expect(asset.startsWith(family[kind]!), `${itemId} → ${asset}`).toBe(true);
    }
    // No two items share one picture (each keeps its own identity).
    expect(new Set(Object.values(ITEM_ART)).size).toBe(Object.values(ITEM_ART).length);
  });

  it('felts only for existing skins; events only for existing season themes; gifts/achievements exist', () => {
    for (const [skin, layout] of [['table_classic_green', 'arc'], ['table_midnight_purple', 'oval'], ['table_emerald_palace', 'board']] as const) {
      expect(seeded.has(skin)).toBe(true);
      expect(has(studioFelt(skin, layout)!.id)).toBe(true);
    }
    expect(studioFelt('table_midnight_purple', 'oval', true)).toBeNull();
    expect(studioFelt('table_royal_gold', 'oval')).toBeNull();
    for (const th of SEASON_THEMES) for (const part of ['icon', 'banner', 'chest', 'badge', 'decoration'] as const) {
      const a = eventArt(th, part);
      if (a) expect(has(a)).toBe(true);
    }
    expect(eventArt('mid_autumn', 'banner')).toBeNull();
    for (const a of [...Object.values(GIFT_ART), ...Object.values(ACHIEVEMENT_ART)]) expect(has(a)).toBe(true);
  });

  it('reward chest by mail contents', () => {
    expect(rewardChest('reward', [], false)).toBeNull();
    expect(rewardChest('reward', [], true)).toBe('chest.common');
    expect(rewardChest('event', [], true)).toBe('chest.event');
    expect(rewardChest('reward', [{ id: 'ss2026_halloween_title', rarity: 'epic' }], false)).toBe('chest.limited');
    expect(rewardChest('reward', [{ id: 'a', rarity: 'rare' }, { id: 'b', rarity: 'epic' }], false)).toBe('chest.epic');
    expect(rewardChest('reward', [{ id: 'a', rarity: 'mythic' }], false)).toBe('chest.legendary');
  });
});

describe('table scene textures', () => {
  it('only the scene that needs a texture loads it; every studio texture resolves', () => {
    for (const t of STUDIO_TEXTURES) {
      expect(has(t.id), t.id).toBe(true);
      expect(resolveCanvasW(t)).toBeGreaterThan(0);
    }
    expect(texturesForScene('slots').every((t) => t.scenes.includes('slots'))).toBe(true);
    expect(texturesForScene('roulette').some((t) => t.key === 'slot-cherry')).toBe(false);
    // Only the reel symbols the game really has (no new symbols = no gameplay change).
    const slotKeys = STUDIO_TEXTURES.filter((t) => t.key.startsWith('slot-')).map((t) => t.key.slice(5));
    expect(slotKeys.sort()).toEqual([...SLOT_SYMBOLS].sort());
  });

  it('roulette wheel: the composite pocket ring lands on the drawn one (r 45–62 world units)', () => {
    const k = ROULETTE_WHEEL_CANVAS_W / 1024;
    expect(436 * k).toBeCloseTo(62, 5);
    expect(318 * k).toBeGreaterThan(44);
    expect(318 * k).toBeLessThan(46);
  });
});

describe('integration status', () => {
  it('252 library assets + 18 earlier samples, each with one status', () => {
    const rows = Object.entries(integration as Record<string, { status: string; wave: string }>);
    expect(rows.length).toBe(270);
    expect(rows.filter(([, e]) => e.wave === 'library').length).toBe(252);
    for (const [id] of rows) expect(has(id)).toBe(true);
  });

  it('assets referenced by bindings are marked integrated', () => {
    const used = new Set<string>([...Object.values(ITEM_ART), ...Object.values(GIFT_ART), ...Object.values(ACHIEVEMENT_ART), ...STUDIO_TEXTURES.map((t) => t.id)]);
    for (const id of used) expect((integration as Record<string, { status: string }>)[id]!.status, id).not.toBe('READY_FOR_FUTURE_USE');
  });
});
