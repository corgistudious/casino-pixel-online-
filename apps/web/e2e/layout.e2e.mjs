/**
 * V7.1 landscape layout across phones / tablets / PCs (replaces the portrait-era orient / land /
 * responsive suites). Every game room and the lobby pages: rotate notice where it belongs, no
 * overflow, table inside its stage and not stretched, control bar on screen, HUD never over the
 * table, ≥44px touch targets (≥32 with a mouse), panels open on screen and close.
 */
import { GAME_ROUTES, UA, context, launch, settle, suite, URL } from './lib.mjs';

const SIZES = [
  ['iphone-se-land', 667, 375, UA.iphone, 'phone'], ['iphone-15-land', 844, 390, UA.iphone, 'phone'], ['iphone-pm-land', 932, 430, UA.iphone, 'phone'], ['android-s-land', 800, 360, UA.android, 'phone'], ['android-l-land', 915, 412, UA.android, 'phone'],
  ['iphone-15-port', 390, 844, UA.iphone, 'phone-port'], ['android-port', 412, 915, UA.android, 'phone-port'],
  ['ipad-port', 820, 1180, UA.ipad, 'tablet-port'], ['ipad-land', 1180, 820, UA.ipad, 'tablet'], ['android-tab-land', 1280, 800, UA.androidTablet, 'tablet'],
  ['laptop-16x9', 1366, 768, '', 'pc'], ['desk-16x10', 1280, 800, '', 'pc'], ['fhd', 1920, 1080, '', 'pc'], ['ultrawide', 2560, 1080, '', 'pc'], ['small-window', 900, 560, '', 'pc'], ['narrow-pc', 520, 800, '', 'pc'],
];
const ROUTES = [...GAME_ROUTES, ['hub', '/'], ['bank', '/bank'], ['profile', '/profile']];
const LOBBY = new Set(['hub', 'bank', 'profile']);
const only = process.env.SIZES?.split(',');

const t = suite('layout');
const b = await launch();
for (const [name, w, h, ua, kind] of SIZES) {
  if (only && !only.includes(name)) continue;
  const touch = kind !== 'pc';
  const ctx = await context(b, { w, h, ua, touch });
  const p = await ctx.newPage();
  t.watch(p, name);
  for (const [rid, path] of ROUTES) {
    await p.goto(`${URL}/#${path}`);
    await p.waitForTimeout(LOBBY.has(rid) ? 1500 : 3000);
    const tag = `${rid} ${name}`;
    const g = await p.evaluate(() => ({ guard: document.querySelector('[data-portrait-guard]')?.getAttribute('data-guard-form') ?? null, inert: document.getElementById('root')?.hasAttribute('inert'), sw: document.documentElement.scrollWidth, vw: innerWidth }));
    if (kind === 'phone-port' || (kind === 'tablet-port' && !LOBBY.has(rid))) {
      t.ok(`${tag}: rotate-to-landscape notice covers the app`, g.guard && g.inert, String(g.guard));
      continue;
    }
    t.ok(`${tag}: no rotate notice`, !g.guard);
    t.ok(`${tag}: no horizontal overflow`, g.sw <= g.vw + 1, `${g.sw}/${g.vw}`);
    if (LOBBY.has(rid)) {
      const tabbar = await p.locator('.ptabbar').count();
      if (kind === 'phone') t.ok(`${tag}: landscape navigation on phones (no portrait tab bar)`, !tabbar);
      if (kind === 'pc' && w >= 640 && h < w) t.ok(`${tag}: no phone tab bar on PC`, !tabbar);
      continue;
    }
    await settle(p);
    const m = await p.evaluate(() => {
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
      const fit = document.querySelector('[data-fit-stage]');
      const cv = document.querySelector('[data-table-skin] canvas');
      return { fit: !!fit, canvas: r(fit ?? cv), intrinsic: cv ? cv.width / cv.height : null, orient: document.querySelector('[data-table-orientation]')?.getAttribute('data-table-orientation'), stage: r(document.querySelector('.gstage')), bar: r(document.querySelector('.gbar')), hud: r(document.querySelector('.ghud-left')), tools: r(document.querySelector('.ghud-tools')), aside: document.querySelectorAll('aside.glass').length, btns: [...document.querySelectorAll('.gbar button, .ghud button')].map((el) => r(el)).filter((x) => x.w > 0), vw: innerWidth, vh: innerHeight };
    });
    if (!m.canvas || !m.stage || !m.bar) { t.ok(`${tag}: layout present`, false); continue; }
    if (!m.fit) {
      t.ok(`${tag}: table not stretched`, Math.abs(m.canvas.w / m.canvas.h - m.intrinsic) < 0.02, `${(m.canvas.w / m.canvas.h).toFixed(3)} vs ${m.intrinsic?.toFixed(3)}`);
      if (kind === 'phone' || kind === 'tablet') t.ok(`${tag}: landscape table layout`, m.orient === 'landscape', m.orient);
      if (kind === 'pc' && w > h) t.ok(`${tag}: landscape table layout on PC`, m.orient === 'landscape', m.orient);
    }
    t.ok(`${tag}: no right sidebar`, m.aside === 0);
    t.ok(`${tag}: table inside its stage`, m.canvas.x >= m.stage.x - 1 && m.canvas.r <= m.stage.r + 1 && m.canvas.y >= m.stage.y - 1 && m.canvas.b <= m.stage.b + 1);
    t.ok(`${tag}: control bar below the table, on screen`, m.bar.y >= m.canvas.b - 1 && m.bar.b <= m.vh + 1);
    const hit = (a, c) => a && c && a.x < c.r - 1 && a.r > c.x + 1 && a.y < c.b - 1 && a.b > c.y + 1;
    t.ok(`${tag}: HUD never covers the table`, !hit(m.hud, m.canvas) && !hit(m.tools, m.canvas));
    const minH = touch ? 43.5 : 31.5;
    const bad = m.btns.filter((x) => x.x < -1 || x.r > m.vw + 1 || x.y < -1 || x.b > m.vh + 1 || x.h < minH);
    t.ok(`${tag}: every button on screen and ≥ ${Math.round(minH)}px`, bad.length === 0, JSON.stringify(bad.slice(0, 2)));
    if (kind === 'phone') t.ok(`${tag}: table fills the stage (landscape)`, m.canvas.h >= m.stage.h - 14 || m.canvas.w >= m.stage.w - 14);
    const tool = p.locator('.ghud-tools .gicon').first();
    if (await tool.count()) {
      await tool.click();
      await p.waitForTimeout(300);
      await p.evaluate(() => document.querySelectorAll('.gpanel, .gpanel-scrim').forEach((el) => el.getAnimations().forEach((a) => a.finish())));
      const panel = await p.evaluate(() => { const e = document.querySelector('.gpanel'); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, r: b.right, b: b.bottom }; });
      t.ok(`${tag}: panel opens on screen`, panel && panel.x >= -1 && panel.r <= m.vw + 1 && panel.b <= m.vh + 1, JSON.stringify(panel));
      await p.keyboard.press('Escape');
      await p.waitForTimeout(150);
      t.ok(`${tag}: panel closes`, (await p.locator('.gpanel').count()) === 0);
    }
  }
  await ctx.close();
}
await b.close();
process.exit(t.done() ? 0 : 1);
