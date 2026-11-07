/**
 * Orientation transitions without losing anything (phones and tablets): the rotate notice covers the
 * app, the Phaser scene (canvas element), bets, turn timer and page stay; the table never switches to
 * another layout mid-round and comes back at exactly its previous size.
 */
import { UA, context, launch, settle, suite, URL } from './lib.mjs';

function initPage() {
  Object.defineProperty(screen.orientation, 'type', { get: () => (innerWidth > innerHeight ? 'landscape-primary' : 'portrait-primary'), configurable: true });
  window.__bootId = Math.random();
}
const t = suite('orientation');
const b = await launch();

async function open(w, h, ua, path) {
  const ctx = await context(b, { w, h, ua, screen: { width: Math.min(w, h), height: Math.max(w, h) } });
  await ctx.addInitScript(initPage);
  const p = await ctx.newPage();
  t.watch(p, `${ua.slice(13, 19)} ${path}`);
  await p.goto(`${URL}/#${path}`);
  await p.waitForTimeout(3000);
  await settle(p);
  await p.evaluate(() => { window.__cv = document.querySelector('[data-table-skin] canvas'); });
  return { ctx, p };
}
async function rotate(p, w, h) {
  await p.setViewportSize({ width: w, height: h });
  await p.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
  await p.waitForTimeout(700);
}
const snap = (p) => p.evaluate(() => {
  const cv = document.querySelector('[data-table-skin] canvas');
  const r = cv?.getBoundingClientRect();
  const timer = document.querySelector('.gtimer b')?.textContent ?? null;
  // The staked total is on the Roll button ("Lắc · 10") and in the 'Tổng cược' stat where shown.
  const total = /·\s*([\d.,]+\s*[KMB]?)/.exec(document.querySelector('.gbar')?.innerText ?? '')?.[1] ?? null;
  const fr = document.querySelector('[data-table-skin]')?.getBoundingClientRect();
  return { guard: document.querySelector('[data-portrait-guard]')?.getAttribute('data-guard-form') ?? null, inert: document.getElementById('root')?.hasAttribute('inert'), same: !!cv && cv === window.__cv, boot: window.__bootId, orient: document.querySelector('[data-table-orientation]')?.getAttribute('data-table-orientation'), w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0, fw: fr ? Math.round(fr.width) : 0, fh: fr ? Math.round(fr.height) : 0, bar: document.querySelector('.gbar')?.getBoundingClientRect().height ?? 0, timer: timer ? parseInt(timer, 10) : null, total };
});

// 1. Phone, Sic Bo with a bet on the table: portrait ↔ landscape three times.
{
  const { ctx, p } = await open(844, 390, UA.iphone, '/play/sicbo');
  await p.locator('.gchip').first().click();
  const box = await p.locator('[data-table-skin] canvas').boundingBox();
  // 'Big' spot centre in the 640×360 landscape world.
  await p.mouse.click(box.x + (588 / 640) * box.width, box.y + (94 / 360) * box.height);
  await p.waitForTimeout(300);
  const s0 = await snap(p);
  t.ok('phone: a bet is on the table', s0.total && s0.total !== '0', String(s0.total));
  let kept = true;
  for (let i = 0; i < 3; i++) {
    await rotate(p, 390, 844);
    const sp = await snap(p);
    t.ok(`phone rotation ${i + 1}: portrait shows the rotate notice over the live scene`, sp.guard === 'phone' && sp.inert && sp.same);
    await rotate(p, 844, 390);
    await settle(p);
    const sl = await snap(p);
    kept &&= sl.same && sl.boot === s0.boot && sl.total === s0.total && sl.orient === 'landscape' && !sl.guard;
    t.ok(`phone rotation ${i + 1}: landscape restores the same scene, bet and size`, sl.same && sl.boot === s0.boot && sl.total === s0.total && Math.abs(sl.w - s0.w) <= 1 && Math.abs(sl.h - s0.h) <= 1, JSON.stringify({ s0, sl }));
  }
  t.ok('phone: game state never reset across rotations', kept);
  await ctx.close();
}
// 2. Tablet mid-round (poker with a running turn timer): portrait = notice, table untouched.
for (const [name, ua, W, H] of [['ipad', UA.ipad, 1180, 820], ['android-tablet', UA.androidTablet, 1280, 800]]) {
  const { ctx, p } = await open(W, H, ua, '/cards/poker-1');
  for (let i = 0; i < 40 && (await snap(p)).timer === null; i++) await p.waitForTimeout(250);
  const s0 = await snap(p);
  t.ok(`${name}: landscape table`, s0.orient === 'landscape' && !s0.guard, JSON.stringify(s0));
  await rotate(p, H, W);
  const sp = await snap(p);
  t.ok(`${name}: portrait mid-round shows the tablet rotate notice`, sp.guard === 'tablet' && sp.inert, String(sp.guard));
  t.ok(`${name}: the scene is not remounted and keeps its landscape design`, sp.same && sp.orient === 'landscape' && sp.boot === s0.boot);
  await p.waitForTimeout(1200);
  await rotate(p, W, H);
  await settle(p);
  const s1 = await snap(p);
  // The table fits its frame again (FIT: one side touches); when the frame is the same size as before
  // (the control bar did not change because my turn started meanwhile) the table is exactly as before.
  const fits = Math.abs(s1.w - s1.fw) <= 2 || Math.abs(s1.h - s1.fh) <= 2;
  const sameFrame = Math.abs(s1.fw - s0.fw) <= 1 && Math.abs(s1.fh - s0.fh) <= 1;
  t.ok(`${name}: back to landscape re-fits the table to its frame`, s1.same && !s1.guard && fits, JSON.stringify({ s0, s1 }));
  t.ok(`${name}: same frame → exactly the same table size`, !sameFrame || (Math.abs(s1.w - s0.w) <= 1 && Math.abs(s1.h - s0.h) <= 1), `${s0.w}x${s0.h} → ${s1.w}x${s1.h} (frame ${s0.fw}x${s0.fh} → ${s1.fw}x${s1.fh}, bar ${s0.bar} → ${s1.bar})`);
  t.ok(`${name}: turn timer kept running (not reset)`, s0.timer === null || s1.timer === null || s1.timer <= s0.timer, `${s0.timer} → ${s1.timer}`);
  await ctx.close();
}
// 3. Tablet lobby stays usable upright (responsive portrait hub, no notice).
{
  const { ctx, p } = await open(820, 1180, UA.ipad, '/');
  t.ok('tablet lobby upright: no rotate notice', !(await snap(p)).guard);
  await ctx.close();
}
// 4. PC: a tall window is never asked to rotate; it gets the portrait table.
{
  const { ctx, p } = await open(520, 800, '', '/cards/poker-1');
  const s = await snap(p);
  t.ok('PC tall window: no notice, portrait table', !s.guard && s.orient === 'portrait', JSON.stringify(s));
  await ctx.close();
}
await b.close();
process.exit(t.done() ? 0 : 1);
