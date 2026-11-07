/**
 * Every app page × several viewports: no horizontal overflow, the document itself never scrolls (long
 * pages scroll inside their own container), no control cut off at the sides, no page errors.
 */
import { UA, context, launch, suite, URL } from './lib.mjs';

const SIZES = [['iphone-se-land', 667, 375, UA.iphone], ['iphone-pm-land', 932, 430, UA.iphone], ['android-land', 800, 360, UA.android], ['ipad-port', 820, 1180, UA.ipad], ['ipad-land', 1180, 820, UA.ipad], ['laptop', 1366, 768, ''], ['fhd', 1920, 1080, ''], ['narrow-pc', 520, 800, '']];
const PAGES = ['/', '/rooms', '/custom-rooms', '/bjt', '/profile', '/market', '/vip', '/bank', '/support', '/achievements', '/chat', '/collection', '/frames', '/mail', '/missions', '/guild', '/friends', '/gifts', '/leaderboard', '/rank', '/settings'];

const t = suite('pages');
const b = await launch();
for (const [name, w, h, ua] of SIZES) {
  const ctx = await context(b, { w, h, ua });
  const p = await ctx.newPage();
  t.watch(p, name);
  for (const path of PAGES) {
    await p.goto(`${URL}/#${path}`);
    await p.waitForTimeout(900);
    const m = await p.evaluate(() => {
      const vw = innerWidth, vh = innerHeight;
      const off = [...document.querySelectorAll('button, a, input, select, textarea')].filter((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        const st = getComputedStyle(el);
        if (st.visibility === 'hidden' || st.display === 'none') return false;
        let q = el.parentElement;
        while (q) { const s = getComputedStyle(q); if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && q.scrollWidth > q.clientWidth) return false; q = q.parentElement; }
        return r.right > vw + 1 || r.left < -1;
      }).map((el) => (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30));
      return { sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, vw, vh, off };
    });
    const tag = `${path} ${name}`;
    t.ok(`${tag}: no horizontal overflow`, m.sw <= m.vw + 1, `${m.sw}/${m.vw}`);
    t.ok(`${tag}: the document never scrolls (pages scroll inside)`, m.sh <= m.vh + 1, `${m.sh}/${m.vh}`);
    t.ok(`${tag}: no control cut off at the sides`, m.off.length === 0, JSON.stringify(m.off.slice(0, 4)));
  }
  await ctx.close();
}
await b.close();
process.exit(t.done() ? 0 : 1);
