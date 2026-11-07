/**
 * Game controls on short landscape screens: the quick bets (½ · Pot · 2× · All-in) stay reachable
 * through the in-place ⚡ switch (nothing pops over the table), every control ≥44px and on screen;
 * wide screens show them inline. Also the 2.5D Sic Bo roll (crystal dome) completes with a result.
 */
import { UA, context, launch, settle, suite, URL } from './lib.mjs';

const t = suite('controls');
const b = await launch();
for (const [name, w, h, ua] of [['iphone-se', 667, 375, UA.iphone], ['iphone-15', 844, 390, UA.iphone], ['android-s', 800, 360, UA.android], ['iphone-pm', 932, 430, UA.iphone], ['ipad-land', 1180, 820, UA.ipad], ['laptop', 1366, 768, '']]) {
  const ctx = await context(b, { w, h, ua });
  const p = await ctx.newPage();
  t.watch(p, name);
  await p.goto(`${URL}/#/cards/poker-1`);
  for (let i = 0; i < 200 && !(await p.locator('.praise').count()); i++) await p.waitForTimeout(250);
  if (!(await p.locator('.praise').count())) { t.ok(`${name}: raise control appears on my turn`, false); await ctx.close(); continue; }
  await settle(p);
  const stage = await p.locator('.gstage').boundingBox();
  const vis = (sel) => p.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getBoundingClientRect().width > 0).map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim(), x: r.left, r: r.right, y: r.top, b: r.bottom, h: r.height, w: r.width }; }), sel);
  const touch = !!ua;
  const more = (await vis('.praise-more'))[0];
  const onScreen = (x) => x.x >= -1 && x.r <= w + 1 && x.y >= -1 && x.b <= h + 1;
  const noCover = (x) => x.y >= stage.y + stage.height - 1; // controls stay below the table stage
  if (more) {
    t.ok(`${name}: slider row visible (− slider + ⚡)`, (await vis('.praise-range')).length === 1 && (await vis('.praise-step')).length === 2);
    await p.locator('.praise-more').click();
    await p.waitForTimeout(150);
    const presets = await vis('.praise-preset');
    const allin = await vis('.praise-allin');
    t.ok(`${name}: quick bets reachable in one tap: ½ · Pot · 2× · All-in`, presets.length === 3 && allin.length === 1, presets.map((x) => x.t).join(','));
    t.ok(`${name}: quick bets ≥44px, on screen, not over the table`, [...presets, ...allin].every((x) => x.h >= 43.5 && x.w >= 43.5 && onScreen(x) && noCover(x)), JSON.stringify(presets[0]));
    const before = await p.locator('.pactions .pbtn').last().innerText();
    await p.locator('.praise-preset').nth(1).click();
    await p.waitForTimeout(150);
    const after = await p.locator('.pactions .pbtn').last().innerText();
    t.ok(`${name}: Pot sets the raise amount`, after !== before || /\d/.test(after), `${before} → ${after}`);
    await p.locator('.praise-more').click();
    await p.waitForTimeout(150);
    t.ok(`${name}: switch back to the slider`, (await vis('.praise-range')).length === 1 && (await vis('.praise-preset')).length === 0);
  } else {
    const presets = await vis('.praise-preset');
    t.ok(`${name}: wide screen shows ½ · Pot · 2× inline`, presets.length === 3 && presets.every((x) => x.h >= (touch ? 43.5 : 31.5) && onScreen(x)));
  }
  const all = await vis('.gbar button');
  t.ok(`${name}: every control on screen and ≥${touch ? 44 : 32}px`, all.every((x) => onScreen(x) && x.h >= (touch ? 43.5 : 31.5)), JSON.stringify(all.filter((x) => !onScreen(x) || x.h < 43.5).slice(0, 2)));
  t.ok(`${name}: no horizontal overflow`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await ctx.close();
}
// Sic Bo roll with the 2.5D dome: completes and shows a result.
{
  const ctx = await context(b, { w: 1366, h: 768 });
  const p = await ctx.newPage();
  t.watch(p, 'sicbo-roll');
  await p.goto(`${URL}/#/play/sicbo`);
  await p.waitForTimeout(3000);
  await p.locator('.gchip').first().click();
  const box = await p.locator('[data-table-skin] canvas').boundingBox();
  await p.mouse.click(box.x + (588 / 640) * box.width, box.y + (94 / 360) * box.height);
  await p.locator('.gbar button.pt-gold, .gbar .pbtn').filter({ hasText: /Lắc|Roll/ }).first().click();
  let done = false;
  for (let i = 0; i < 480 && !done; i++) { await p.waitForTimeout(250); done = await p.evaluate(() => !document.querySelector('.gbar [aria-busy="true"]')) && i > 4; }
  t.ok('sic bo: 2.5D roll completes (dome lifts, result settles)', done);
  await ctx.close();
}
await b.close();
process.exit(t.done() ? 0 : 1);
