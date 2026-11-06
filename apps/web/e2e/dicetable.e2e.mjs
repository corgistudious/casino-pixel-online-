/**
 * Sic Bo / Tài Xỉu responsive regression. For every viewport and both games it reads the live Phaser
 * scene (QA hook, preview builds only), maps every betting spot from world units to screen pixels
 * through the real camera + scale transform (the same path input uses), and checks:
 *  - every spot lies inside the felt, clear of the gold rail, and never over the dice plate;
 *  - spots keep a usable on-screen size; the canvas is not stretched and sits inside its stage;
 *  - a click at each spot's centre hits exactly that spot (hitbox = drawn box);
 *  - controls on screen, no horizontal overflow, the layout survives resizes and rotations.
 */
import { UA, context, launch, settle, suite, URL } from './lib.mjs';

const VIEWPORTS = [
  [568, 320], [640, 360], [667, 375], [740, 360], [844, 390], [874, 402], [932, 430], [956, 440],
  // In-between / unusual ratios.
  [600, 340], [720, 330], [800, 450], [1000, 470],
  [1024, 768], [1194, 834], [1366, 768], [1920, 1080], [2560, 1440], [3440, 1440], [1280, 1024], [1600, 600],
];
const kindOf = (w, h) => (h <= 500 ? 'phone' : w <= 1194 ? 'tablet' : 'pc');
const uaOf = { phone: UA.android, tablet: UA.ipad, pc: '' };
const only = process.env.SIZES?.split(',');

function readScene() {
  const s = window.__keyoScene;
  const cv = document.querySelector('[data-table-skin] canvas');
  if (!s || !s.layout || !cv) return null;
  const r = cv.getBoundingClientRect();
  const cam = s.cameras.main;
  const k = r.width / s.scale.width; // CSS px per canvas px
  const toScreen = (x, y) => ({ x: r.left + (cam.x + (x - cam.worldView.x) * cam.zoom) * k, y: r.top + (cam.y + (y - cam.worldView.y) * cam.zoom) * k });
  const box = (x, y, w, h) => { const a = toScreen(x, y); const b = toScreen(x + w, y + h); return { x: a.x, y: a.y, r: b.x, b: b.y, w: b.x - a.x, h: b.y - a.y }; };
  const L = s.layout;
  const rail = 10;
  const stage = document.querySelector('[data-table-skin]').getBoundingClientRect();
  return {
    world: { w: s.sw, h: s.sh },
    canvas: { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, ratio: cv.width / cv.height },
    frame: { x: stage.left, y: stage.top, r: stage.right, b: stage.bottom },
    felt: box(rail, rail, s.sw - 2 * rail, s.sh - 2 * rail),
    plate: box(L.bowl.x - L.bowl.r, L.bowl.y - L.bowl.r, L.bowl.r * 2, L.bowl.r * 2),
    spots: s.spotRects().map((p) => ({ key: p.key, ...box(p.x, p.y, p.w, p.h) })),
    portrait: s.portrait,
  };
}

const t = suite('dicetable');
const b = await launch();
for (const [w, h] of VIEWPORTS) {
  if (only && !only.includes(`${w}x${h}`)) continue;
  const kind = kindOf(w, h);
  const ctx = await context(b, { w, h, ua: uaOf[kind] });
  const p = await ctx.newPage();
  t.watch(p, `${w}x${h}`);
  for (const [game, path] of [['sicbo', '/play/sicbo'], ['taixiu', '/tables/taixiu-1']]) {
    const tag = `${game} ${w}x${h}`;
    await p.goto(`${URL}/#${path}`);
    await p.waitForTimeout(2600);
    await settle(p);
    await p.evaluate(`window.__readScene = ${readScene.toString()}`);
    const m = await p.evaluate(readScene);
    if (!m) { t.ok(`${tag}: scene readable`, false); continue; }
    t.ok(`${tag}: canvas not stretched`, Math.abs(m.canvas.w / m.canvas.h - m.canvas.ratio) < 0.02);
    t.ok(`${tag}: canvas inside its frame`, m.canvas.x >= m.frame.x - 1 && m.canvas.r <= m.frame.r + 1 && m.canvas.y >= m.frame.y - 1 && m.canvas.b <= m.frame.b + 1);
    t.ok(`${tag}: all 25 betting spots present`, m.spots.length === 25, String(m.spots.length));
    const margin = 2; // px clear of the rail's inner edge
    const out = m.spots.filter((s) => s.x < m.felt.x + margin || s.r > m.felt.r - margin || s.y < m.felt.y + margin || s.b > m.felt.b - margin);
    t.ok(`${tag}: every spot inside the felt (clear of the gold rail)`, out.length === 0, JSON.stringify(out.slice(0, 2)));
    const overPlate = m.spots.filter((s) => s.x < m.plate.r && s.r > m.plate.x && s.y < m.plate.b && s.b > m.plate.y);
    t.ok(`${tag}: board never over the dice plate`, overPlate.length === 0, overPlate.map((s) => s.key).join(','));
    const offScreen = m.spots.filter((s) => s.x < -1 || s.r > w + 1 || s.y < -1 || s.b > h + 1);
    t.ok(`${tag}: every spot on screen`, offScreen.length === 0);
    const minW = Math.min(...m.spots.map((s) => s.w));
    const minH = Math.min(...m.spots.map((s) => s.h));
    t.ok(`${tag}: spots keep a usable size (≥ 20×34 px)`, minW >= 20 && minH >= 34, `${minW.toFixed(1)}×${minH.toFixed(1)}`);
    if (process.env.E2E_SHOTS) await p.screenshot({ path: `${process.env.E2E_SHOTS}/${game}_${w}x${h}.png` });
    // Hitboxes: a click at each spot's centre must hit that spot.
    const hits = await p.evaluate(() => {
      const s = window.__keyoScene;
      window.__hits = [];
      s.interactive = true;
      s.events.on('spot', (k) => window.__hits.push(k));
      return true;
    });
    // One tap at a time, each paired with the event it produced. Phaser reads input once per frame and
    // headless Chromium renders at ~5 FPS, so a tap that produced NO event (merged into the previous
    // frame by the test driver) is repeated once; a tap that hits a DIFFERENT spot is a failure.
    // Each tap re-reads the spot's CURRENT screen box (the Tài Xỉu bar changes height with the round
    // phase and the canvas re-fits) and keeps the scene accepting taps (the round phase toggles it;
    // this checks the hitbox, not the betting window).
    const got = [];
    for (const s of m.spots) {
      let key = null;
      for (let attempt = 0; attempt < 2 && key === null; attempt++) {
        const now = await p.evaluate((k) => { window.__keyoScene.interactive = true; return (window.__readScene().spots.find((q) => q.key === k)); }, s.key);
        const n0 = await p.evaluate(() => window.__hits.length);
        await p.mouse.click((now.x + now.r) / 2, (now.y + now.b) / 2);
        for (let k = 0; k < 25 && key === null; k++) {
          await p.waitForTimeout(60);
          key = await p.evaluate((n) => (window.__hits.length > n ? window.__hits[window.__hits.length - 1] : null), n0);
        }
      }
      got.push(key);
    }
    const miss = m.spots.filter((s, i) => got[i] !== s.key).map((s, i) => `${s.key}→${got[m.spots.indexOf(s)]}`);
    t.ok(`${tag}: every tap lands on the spot drawn there`, hits && miss.length === 0, miss.slice(0, 3).join(' '));
    const ui = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight, btns: [...document.querySelectorAll('.gbar button, .ghud button')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => ({ x: r.left, r: r.right, y: r.top, b: r.bottom, h: r.height })) }));
    t.ok(`${tag}: no page overflow / scrollbar`, ui.sw <= ui.vw + 1 && ui.sh <= ui.vh + 1);
    const touch = kind !== 'pc';
    const badBtn = ui.btns.filter((x) => x.x < -1 || x.r > w + 1 || x.y < -1 || x.b > h + 1 || x.h < (touch ? 43.5 : 31.5));
    t.ok(`${tag}: chips and bet controls on screen and ≥${touch ? 44 : 32}px`, badBtn.length === 0, JSON.stringify(badBtn.slice(0, 2)));
  }
  await ctx.close();
}

// Resize and rotation: the board stays inside the felt; the same scene survives (no remount).
for (const [game, path] of [['sicbo', '/play/sicbo'], ['taixiu', '/tables/taixiu-1']]) {
  const ctx = await context(b, { w: 844, h: 390, ua: UA.iphone, screen: { width: 390, height: 844 } });
  await ctx.addInitScript(() => Object.defineProperty(screen.orientation, 'type', { get: () => (innerWidth > innerHeight ? 'landscape-primary' : 'portrait-primary'), configurable: true }));
  const p = await ctx.newPage();
  t.watch(p, `${game} resize`);
  await p.goto(`${URL}/#${path}`);
  await p.waitForTimeout(2600);
  await settle(p);
  const id = await p.evaluate(() => { window.__s0 = window.__keyoScene; return !!window.__s0; });
  for (const [w, h] of [[932, 430], [667, 375], [390, 844], [844, 390]]) {
    await p.setViewportSize({ width: w, height: h });
    await p.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    await p.waitForTimeout(700);
    await settle(p);
    const tag = `${game} → ${w}x${h}`;
    const r = await p.evaluate(() => ({ same: window.__keyoScene === window.__s0, guard: !!document.querySelector('[data-portrait-guard]') }));
    t.ok(`${tag}: same scene (no remount, state kept)`, id && r.same);
    if (h > w) { t.ok(`${tag}: portrait shows the rotate notice`, r.guard); continue; }
    const m = await p.evaluate(readScene);
    const out = m.spots.filter((s) => s.x < m.felt.x || s.r > m.felt.r || s.y < m.felt.y || s.b > m.felt.b || s.r > w || s.b > h);
    t.ok(`${tag}: board still inside the felt and on screen`, out.length === 0 && !r.guard);
  }
  await ctx.close();
}
// Canvas that MOVES without resizing (a bar above it changes height): taps must still land right.
for (const [game, path] of [['sicbo', '/play/sicbo'], ['taixiu', '/tables/taixiu-1']]) {
  const ctx = await context(b, { w: 844, h: 390, ua: UA.android });
  const p = await ctx.newPage();
  t.watch(p, `${game} shift`);
  await p.goto(`${URL}/#${path}`);
  await p.waitForTimeout(2600);
  await settle(p);
  await p.evaluate(`window.__readScene = ${readScene.toString()}`);
  await p.evaluate(() => {
    window.__hits = [];
    window.__keyoScene.events.on('spot', (k) => window.__hits.push(k));
    // Shift the canvas frame by (23, 31) px without changing its size (no ResizeObserver, no refresh).
  });
  const keys = ['small', 'total:4', 'total:10', 'total:17', 'single:3', 'big'];
  const got = [];
  for (const k of keys) {
    let key = null;
    for (let attempt = 0; attempt < 2 && key === null; attempt++) {
      // Move the canvas frame by a new (x, y) offset without changing its size, then tap at once
      // (Phaser's own bounds poll runs only every ~500 ms).
      const s = await p.evaluate(([kk, n]) => {
        Object.assign(document.querySelector('[data-table-skin]').style, { position: 'relative', left: `${(n % 2 ? 23 : -17)}px`, top: `${(n % 2 ? 31 : -9)}px` });
        window.__keyoScene.interactive = true;
        return window.__readScene().spots.find((q) => q.key === kk);
      }, [k, got.length + attempt]);
      const n0 = await p.evaluate(() => window.__hits.length);
      await p.mouse.click((s.x + s.r) / 2, (s.y + s.b) / 2);
      for (let i = 0; i < 25 && key === null; i++) {
        await p.waitForTimeout(60);
        key = await p.evaluate((n) => (window.__hits.length > n ? window.__hits[window.__hits.length - 1] : null), n0);
      }
    }
    got.push(key);
  }
  t.ok(`${game}: after the canvas moves (no resize), taps still hit the spot drawn there`, keys.every((k, i) => got[i] === k), got.join(','));
  await ctx.close();
}
await b.close();
process.exit(t.done() ? 0 : 1);
