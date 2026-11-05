/**
 * iPhone home-screen app (PWA) startup / relaunch / viewport regression (Chromium emulation of the
 * WebKit numbers measured on a real iPhone: screen 440×956, a 956×378 window after rotate-then-open).
 * Real-device behaviour still needs an iPhone: this proves the app-side logic only.
 */
import { UA, context, launch, settle, suite, URL } from './lib.mjs';

/** Runs before the app: standalone flags, orientation, optional innerHeight / keyboard fakes, counters. */
function initPage({ innerHeight = null, diag = false, token = null }) {
  if (diag) localStorage.setItem('keyo.vpdiag', '1');
  if (token) localStorage.setItem('cpo.token', token);
  Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
  Object.defineProperty(screen.orientation, 'type', { get: () => (innerWidth > innerHeight ? 'landscape-primary' : 'portrait-primary'), configurable: true });
  if (innerHeight !== null) Object.defineProperty(window, 'innerHeight', { get: () => innerHeight, configurable: true });
  window.__bootId = Math.random();
  // iOS-like visual viewport with a controllable keyboard.
  const vv = new EventTarget();
  let kb = 0;
  Object.defineProperties(vv, { height: { get: () => window.innerHeight - kb }, width: { get: () => window.innerWidth }, offsetTop: { get: () => 0 }, offsetLeft: { get: () => 0 }, pageTop: { get: () => 0 }, pageLeft: { get: () => 0 }, scale: { get: () => 1 } });
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
  window.__kb = (px) => { kb = px; vv.dispatchEvent(new Event('resize')); };
  let vis = 'visible';
  Object.defineProperty(document, 'visibilityState', { get: () => vis, configurable: true });
  window.__vis = (v) => { vis = v; document.dispatchEvent(new Event('visibilitychange')); };
  // Net listener count on window / document / visualViewport (cleanup check).
  window.__listeners = 0;
  const add = EventTarget.prototype.addEventListener;
  const rem = EventTarget.prototype.removeEventListener;
  const tracked = (t) => t === window || t === document || t === vv;
  const seen = new WeakMap();
  EventTarget.prototype.addEventListener = function (type, fn, o) {
    if (tracked(this) && fn) { const k = `${type}`; const set = seen.get(fn) ?? new Set(); if (!set.has(k + (this === window ? 'w' : this === document ? 'd' : 'v'))) { set.add(k + (this === window ? 'w' : this === document ? 'd' : 'v')); seen.set(fn, set); window.__listeners++; (window.__live ??= {})[k] = ((window.__live ??= {})[k] ?? 0) + 1; } }
    return add.call(this, type, fn, o);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, o) {
    if (tracked(this) && fn) { const set = seen.get(fn); const k = `${type}` + (this === window ? 'w' : this === document ? 'd' : 'v'); if (set?.delete(k)) { window.__listeners--; window.__live[type] -= 1; } }
    return rem.call(this, type, fn, o);
  };
  // Style / class writes on <html> and #root (resize-loop check).
  window.__writes = 0;
  const watchWrites = () => new MutationObserver((l) => { window.__writes += l.length; }).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
  if (document.documentElement) watchWrites();
  else document.addEventListener('DOMContentLoaded', watchWrites, { once: true });
}

const t = suite('pwa');
const b = await launch();
const SCREEN = { width: 440, height: 956 };
async function open(w, h, opts = {}, path = '/play/sicbo') {
  const ctx = await context(b, { w, h, ua: UA.iphone, dpr: 2, screen: SCREEN });
  await ctx.addInitScript(initPage, opts);
  // The installed app is blocked by default (lib/pwaBlock.ts); the runtime policy file re-allows it,
  // exactly as an operator would on the server.
  await ctx.route('**/pwa-policy.json', (r) => r.fulfill({ contentType: 'application/json', body: '{"ios":false,"android":false}' }));
  const p = await ctx.newPage();
  t.watch(p, `${w}x${h}`);
  await p.goto(`${URL}/#${path}`);
  await p.waitForTimeout(2600);
  await settle(p);
  return { ctx, p };
}
const state = (p) => p.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), b: Math.round(b.bottom) }; };
  return { fill: document.documentElement.classList.contains('vp-fill-lvh'), root: r('#root'), stage: r('.gstage'), canvas: r('[data-table-skin] canvas'), hint: !!document.querySelector('[data-testid="ios-window-hint"]'), meta: document.querySelector('meta[name="viewport"]').getAttribute('content'), boot: window.__bootId, listeners: window.__listeners, writes: window.__writes };
});

// A. Normal landscape launch: nothing to fix, nothing written.
{
  const { ctx, p } = await open(956, 440);
  const s = await state(p);
  t.ok('A normal launch: no lvh fill, no hint', !s.fill && !s.hint);
  t.ok('A normal launch: root = window, canvas inside the stage', s.root.h === 440 && s.canvas.b <= s.stage.b + 1, JSON.stringify(s));
  const w0 = s.writes;
  await p.waitForTimeout(2500);
  t.ok('A viewport stable at rest (no resize loop: no style/class writes for 2.5 s)', (await state(p)).writes === w0);
  await ctx.close();
}
// B. Rotate-then-open: iOS gives a 62 px short WEB VIEW (window-short) → never sized past it.
{
  const { ctx, p } = await open(956, 378);
  await p.waitForTimeout(1200);
  const s = await state(p);
  t.ok('B window-short: root stays inside the window (bottom controls visible)', s.root.h === 378 && !s.fill, JSON.stringify(s.root));
  t.ok('B window-short: bounded viewport re-read leaves the meta as it was', s.meta.includes('viewport-fit=cover') && !s.meta.includes('shrink-to-fit'), s.meta);
  t.ok('B window-short: the relaunch hint is shown', s.hint);
  t.ok('B window-short: canvas inside its stage', s.canvas.b <= s.stage.b + 1);
  // iOS fixes the window (e.g. after the launch animation): everything follows, no reload.
  await p.setViewportSize({ width: 956, height: 440 });
  await p.waitForTimeout(900);
  await settle(p);
  const s2 = await state(p);
  t.ok('B recovery: root and stage grow to the full window without a reload', s2.root.h === 440 && s2.stage.h > s.stage.h && s2.boot === s.boot, `${s.stage.h}→${s2.stage.h}`);
  t.ok('B recovery: hint gone', !s2.hint);
  t.ok('B recovery: canvas re-fitted (taller) and inside the stage', s2.canvas.h > s.canvas.h && s2.canvas.b <= s2.stage.b + 1, `${s.canvas.h}→${s2.canvas.h}`);
  await ctx.close();
}
// C. Short LAYOUT viewport inside a full web view (layout-short): the root fills 100lvh.
{
  const { ctx, p } = await open(956, 440, { innerHeight: 378 });
  const s = await state(p);
  t.ok('C layout-short: root filled to 100lvh (paints the strip)', s.fill && s.root.h === 440, JSON.stringify(s.root));
  t.ok('C layout-short: no relaunch hint (nothing missing)', !s.hint);
  await ctx.close();
}
// D. Resume from the background / bfcache: no reload, same scene, bounded diagnostics record, no token.
{
  const { ctx, p } = await open(956, 440, { diag: true, token: 'SECRET-TOKEN-123' });
  const before = await state(p);
  const cv = await p.evaluate(() => { window.__cv = document.querySelector('[data-table-skin] canvas'); return !!window.__cv; });
  await p.evaluate(() => window.__vis('hidden'));
  await p.waitForTimeout(300);
  await p.evaluate(() => { window.__vis('visible'); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
  await p.waitForTimeout(3600);
  const after = await state(p);
  const rec = await p.evaluate(() => ({ same: window.__cv === document.querySelector('[data-table-skin] canvas'), resumes: localStorage.getItem('keyo.vpdiag.resumes') ?? '' }));
  t.ok('D resume: no reload, the game scene (canvas) is the same', cv && rec.same && after.boot === before.boot);
  t.ok('D resume: root/stage unchanged', after.root.h === before.root.h && after.stage.h === before.stage.h);
  let parsed = [];
  try { parsed = JSON.parse(rec.resumes); } catch { /* */ }
  t.ok('D resume: a bounded resume record is saved (≤5 records, ≤30 samples each)', parsed.length >= 1 && parsed.length <= 5 && parsed.every((r) => r.samples.length <= 30), `${parsed.length}`);
  t.ok('D resume: diagnostics contain no token', !rec.resumes.includes('SECRET-TOKEN-123') && !/token/i.test(rec.resumes));
  t.ok('D resume: samples carry the layer verdict', parsed[0]?.samples?.[0]?.layer?.layer === 'none', JSON.stringify(parsed[0]?.samples?.[0]?.layer));
  await ctx.close();
}
// E. Keyboard: the app fits above it, the table keeps its size, everything is undone on close.
{
  const { ctx, p } = await open(956, 440, {}, '/settings');
  const input = p.locator('input[type="text"], input:not([type]), textarea').first();
  if (await input.count()) {
    await input.focus();
    await p.evaluate(() => window.__kb(200));
    await p.waitForTimeout(300);
    const k = await p.evaluate(() => ({ open: document.documentElement.classList.contains('keyboard-open'), vvh: document.documentElement.style.getPropertyValue('--vvh') }));
    t.ok('E keyboard: app fits above the keyboard', k.open && k.vvh === '240px', JSON.stringify(k));
    await p.evaluate(() => { document.activeElement.blur(); window.__kb(0); });
    await p.waitForTimeout(300);
    const k2 = await p.evaluate(() => ({ open: document.documentElement.classList.contains('keyboard-open'), vvh: document.documentElement.style.getPropertyValue('--vvh') }));
    t.ok('E keyboard: undone on close', !k2.open && !k2.vvh);
  } else t.ok('E keyboard: settings has a text field', false);
  await ctx.close();
}
// F. Listener cleanup: entering and leaving game rooms does not leak window/document listeners.
{
  const { ctx, p } = await open(956, 440, {}, '/');
  const counts = [];
  for (let i = 0; i < 3; i++) {
    for (const r of ['/play/sicbo', '/tables/taixiu-1', '/cards/poker-1', '/']) {
      await p.evaluate((h) => { location.hash = h; }, `#${r}`);
      await p.waitForTimeout(r === '/' ? 900 : 1800);
    }
    counts.push((await state(p)).listeners);
    if (process.env.E2E_DEBUG) console.log(JSON.stringify(await p.evaluate(() => window.__live)));
  }
  t.ok('F listener cleanup: count stable across room visits (no leaked Phaser games)', counts[2] <= counts[0], counts.join(' → '));
  await ctx.close();
}
await b.close();
process.exit(t.done() ? 0 : 1);
