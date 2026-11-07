/**
 * Asset integration check (UI-preview build, Chromium emulation — not real devices).
 * Opens every screen that shows Asset Studio art, records which studio files the browser really
 * fetched (network) and decoded, fails on broken files (HTTP error / decode error), and checks that a
 * screen only downloads its own art (no screen fetches the whole library).
 * Writes the verified ids to e2e/out/assets-verified.json (read by the integration report) and
 * screenshots to e2e/out/assets/ when E2E_SHOTS=1.
 */
import fs from 'node:fs';
import { URL as BASE, context, launch, settle, suite } from './lib.mjs';

const OUT = new URL('./out/', import.meta.url);
const ROUTES = [
  ['hub', '/'],
  ['roulette', '/play/roulette'],
  ['sicbo', '/play/sicbo'],
  ['taixiu', '/tables/taixiu-1'],
  ['roulette-table', '/tables/roulette-1'],
  ['slots', '/play/slots'],
  ['blackjack', '/play/blackjack'],
  ['poker', '/cards/poker-1'],
  ['lieng', '/cards/lieng-1'],
  ['xito', '/cards/xito-1'],
  ['bjt', '/bjt/bj-1'],
  ['vip', '/vip'],
  ['profile', '/profile'],
  ['player', '/player/1001'],
  ['market', '/market'],
  ['collection', '/collection'],
  ['frames', '/frames'],
  ['bank', '/bank'],
  ['mail', '/mail'],
  ['missions', '/missions'],
  ['achievements', '/achievements'],
  ['leaderboard', '/leaderboard'],
  ['rank', '/rank'],
  ['gifts', '/gifts'],
  ['chat', '/chat'],
];
const idOf = (url) => /assets\/keyo\/[a-z]+\/(.+)\.\d+\.[0-9a-f]{10}\.webp/.exec(url)?.[1] ?? null;

const s = suite('assets');
const browser = await launch();
const ctx = await context(browser, { w: 1280, h: 720, dpr: 1 });
const p = await ctx.newPage();
s.watch(p, 'assets');
const seen = new Map(); // id -> screens
const perScreen = {};
const broken = [];
p.on('response', (r) => {
  const id = idOf(r.url());
  if (!id) return;
  if (r.status() >= 400) broken.push(`${id} HTTP ${r.status()}`);
});
let current = '';
p.on('requestfinished', (r) => {
  const id = idOf(r.url());
  if (!id) return;
  (perScreen[current] ??= new Set()).add(id);
  if (!seen.has(id)) seen.set(id, new Set());
  seen.get(id).add(current);
});
fs.mkdirSync(new URL('./assets/', OUT), { recursive: true });
for (const [name, route] of ROUTES) {
  current = name;
  await p.goto(`${BASE}/#${route}`);
  await settle(p).catch(() => {});
  await p.waitForTimeout(2200);
  // Every studio <img> on the page decoded (naturalWidth > 0) — no broken image icons.
  const imgs = await p.evaluate(() => [...document.querySelectorAll('img[data-keyo-asset]')].map((i) => ({ id: i.getAttribute('data-keyo-asset'), ok: i.complete ? i.naturalWidth > 0 : null, lazy: i.loading === 'lazy' })));
  for (const i of imgs) if (i.ok === false) broken.push(`${i.id} decode (${name})`);
  if (process.env.E2E_SHOTS) await p.screenshot({ path: new URL(`./assets/${name}.png`, OUT).pathname });
  s.ok(`${name}: loads only its own art (< 120 files)`, (perScreen[name]?.size ?? 0) < 120, String(perScreen[name]?.size ?? 0));
}
s.ok('no broken studio file', broken.length === 0, broken.slice(0, 10).join(', '));
const verified = Object.fromEntries([...seen.entries()].map(([id, screens]) => [id, [...screens]]));
fs.writeFileSync(new URL('./assets-verified.json', OUT), JSON.stringify({ at: new Date().toISOString(), url: BASE, verified, perScreen: Object.fromEntries(Object.entries(perScreen).map(([k, v]) => [k, v.size])) }, null, 1));
console.log(`studio assets fetched across ${ROUTES.length} screens: ${seen.size}`);
await browser.close();
process.exit(s.done() ? 0 : 1);
