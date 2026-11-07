/**
 * Shared helpers for the V7.1 browser regression suites (Chromium emulation, NOT real devices).
 * Target: a UI-preview build served locally (no game server needed):
 *   VITE_DEMO=1 pnpm --filter @casino/web exec vite build --outDir dist-demo
 *   pnpm --filter @casino/web exec vite preview --outDir dist-demo --port 5180
 *   pnpm --filter @casino/web e2e            (E2E_URL overrides http://localhost:5180)
 * Playwright is resolved from the environment (it is not a dependency of the app); set
 * CHROMIUM_PATH to use a specific browser binary.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

export const URL = (process.env.E2E_URL ?? 'http://localhost:5180').replace(/\/$/, '');
export const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  androidTablet: 'Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

export function launch() {
  return chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
}

/** A results collector: ok(name, cond, extra) and a summary that sets the exit code. */
export function suite(name) {
  const res = [];
  const errors = [];
  return {
    errors,
    ok(n, v, x = '') {
      res.push(!!v);
      if (!v || process.env.E2E_VERBOSE) console.log(v ? 'PASS' : 'FAIL', n, x);
    },
    watch(page, tag) {
      page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    },
    done() {
      const passed = res.filter(Boolean).length;
      if (errors.length) console.log('page errors:', errors.slice(0, 8));
      console.log(`[${name}] ${passed}/${res.length} passed${errors.length ? `, ${errors.length} page errors` : ''}`);
      return passed === res.length && errors.length === 0;
    },
  };
}

/** `mobile` = Playwright isMobile (also sets UA-CH mobile=true, so Android tablets pass mobile: false, as real ones report). */
export async function context(browser, { w, h, ua = '', touch = !!ua, mobile = touch && ua !== UA.androidTablet, dpr = 1, screen } = {}) {
  return browser.newContext({ userAgent: ua || undefined, viewport: { width: w, height: h }, screen: screen ?? { width: w, height: h }, isMobile: mobile, hasTouch: touch, deviceScaleFactor: dpr, locale: 'vi-VN' });
}

/** Waits until the given selectors stop changing size (fonts, Phaser fit). */
export async function settle(p, sel = '.gstage, .gbar, [data-table-skin] canvas, [data-fit-stage]') {
  let prev = '';
  for (let i = 0; i < 14; i++) {
    const cur = await p.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; }).join('|'), sel);
    if (cur && cur === prev) return;
    prev = cur;
    await p.waitForTimeout(250);
  }
}

export const GAME_ROUTES = [['taixiu', '/tables/taixiu-1'], ['roulette', '/tables/roulette-1'], ['poker', '/cards/poker-1'], ['lieng', '/cards/lieng-1'], ['xito', '/cards/xito-1'], ['bjt', '/bjt/bj-1'], ['bjsolo', '/play/blackjack'], ['sicbo', '/play/sicbo'], ['roulette-solo', '/play/roulette'], ['slots', '/play/slots']];
