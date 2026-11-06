import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PATHS, REPO } from './config.mjs';

const SKIP = new Set(['node_modules', 'dist', 'dist-preview', '.git', 'previews', 'generated', 'android', 'build']);
const IMG = /\.(png|webp|jpe?g|gif|svg)$/i;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (IMG.test(e.name)) out.push(p);
  }
  return out;
}

function grepCount(root, needle) {
  let n = 0;
  const visit = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) visit(p);
      else if (/\.(tsx?|css|html|mjs)$/.test(e.name) && fs.readFileSync(p, 'utf8').includes(needle)) n++;
    }
  };
  visit(root);
  return n;
}

/** Phase 1 source audit: image files, their size/usage, and the systems that need art. */
export async function audit() {
  const files = walk(REPO).filter((f) => !f.includes(`${path.sep}docs${path.sep}previews`));
  const images = [];
  for (const f of files) {
    const rel = path.relative(REPO, f);
    let meta = {};
    try {
      meta = await sharp(f).metadata();
    } catch {
      /* svg without size etc. */
    }
    const base = path.basename(f);
    images.push({ file: rel, bytes: fs.statSync(f).size, width: meta.width ?? null, height: meta.height ?? null, alpha: meta.hasAlpha ?? null, referencedIn: grepCount(path.join(REPO, 'apps/web'), base) + grepCount(path.join(REPO, 'apps/server/src'), base) });
  }
  const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
  const seeded = {};
  for (const f of fs.readdirSync(path.join(REPO, 'apps/server/drizzle')).filter((x) => x.endsWith('.sql'))) {
    for (const m of read(`apps/server/drizzle/${f}`).matchAll(/\('[a-z0-9_]+',\s*'(frame|chat_bubble|title|card_back|table_skin|avatar|collectible|victory_effect)'/g)) seeded[m[1]] = (seeded[m[1]] ?? 0) + 1;
  }
  const vip = (read('packages/shared/src/vip.ts').match(/\{ level: \d+,/g) ?? []).length;
  const routes = [...read('apps/web/src/App.tsx').matchAll(/path="(\/(play|tables|cards|bjt)\/[^"]*)"/g)].map((m) => m[1]);
  const slots = /SLOT_SYMBOLS = \[([^\]]+)\]/.exec(read('packages/shared/src/games/slots.ts'))?.[1].replace(/'/g, '').split(',').map((s) => s.trim());
  const seasons = /SEASON_THEMES = \[([^\]]+)\]/.exec(read('packages/shared/src/frameLibrary.ts'))?.[1].replace(/'/g, '').split(',').map((s) => s.trim());
  const gifts = [...read('packages/shared/src/gifts.ts').matchAll(/id: '([a-z_]+)'/g)].map((m) => m[1]);
  const result = {
    at: new Date().toISOString(),
    images,
    games: {
      officialModes: ['Tài Xỉu (shared table)', 'Sic Bo (solo)', 'Roulette (shared table)', 'Roulette (solo)', "Texas Hold'em Poker", 'Liêng', 'Xì Tố', 'Blackjack (multiplayer table)', 'Blackjack (solo)', 'Slots'],
      routes,
      lobbyCards: ['poker', 'sicbo', 'roulette', 'lieng', 'xito', 'blackjack'],
      note: 'Hub shows 6 game cards; Sic Bo/Tài Xỉu, Roulette solo/table and Blackjack solo/table share a card. Slots is reached at /play/slots (not a hub card).',
      slotSymbols: slots,
    },
    vipLevels: vip,
    seededCosmetics: seeded,
    seasonThemes: seasons,
    giftCatalog: gifts,
    rendering: 'Game visuals are procedural (Phaser canvas, apps/web/src/game/art.ts); cosmetics are SVG/CSS drawn (apps/web/src/cosmetics). Uploaded cosmetic art is limited to PNG/WebP/GIF ≤1024 px and ≤1 MB (packages/shared/src/cosmetics.ts).',
  };
  fs.mkdirSync(PATHS.reports, { recursive: true });
  fs.writeFileSync(path.join(PATHS.reports, 'inventory.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}
