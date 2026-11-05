import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_NUDGES, installViewport, keyboardFrame, keyboardState, stableBox, toggledViewportContent, viewportEvents } from '../src/lib/viewport';
import { classifyBand, diagnoseLayers, shouldFillLvh, startupInset } from '../src/lib/viewportProbe';

// Real numbers seen on an iPhone (screen 440×956) launched right after rotating to landscape.
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const land = { landscape: true, screenW: 440, screenH: 956 };

describe('keyboard (unchanged behaviour)', () => {
  it('opens only with a focused field and a clear shrink', () => {
    expect(keyboardState(844, 500, true)).toEqual({ open: true, appHeight: 500 });
    expect(keyboardState(844, 500, false).open).toBe(false);
    expect(keyboardState(844, 780, true).open).toBe(false);
  });
  it('follows an iOS visual-viewport pan', () => expect(keyboardFrame(844, 500, 40, true)).toEqual({ open: true, top: 40, height: 500, kb: 304 }));
  it('scale renderers keep their box while only the keyboard shrinks them, never on rotation', () => {
    expect(stableBox({ w: 844, h: 390 }, { w: 844, h: 200 }, true)).toEqual({ w: 844, h: 390 });
    expect(stableBox({ w: 844, h: 390 }, { w: 390, h: 844 }, true)).toEqual({ w: 390, h: 844 });
    expect(stableBox({ w: 844, h: 390 }, { w: 844, h: 200 }, false)).toEqual({ w: 844, h: 200 });
  });
});

describe('PWA startup: where a short window comes from', () => {
  it('full window → nothing to do', () => expect(classifyBand({ ...land, innerHeight: 440, visualHeight: 440, lvh: 440 }).verdict).toBe('full'));
  it('short layout viewport inside a full web view → layout-short (app can paint it)', () =>
    expect(classifyBand({ ...land, innerHeight: 378, visualHeight: 378, lvh: 440 })).toEqual({ verdict: 'layout-short', gap: 62 }));
  it('short web view → window-short (iOS owns the strip)', () =>
    expect(classifyBand({ ...land, innerHeight: 378, visualHeight: 378, lvh: 378 })).toEqual({ verdict: 'window-short', gap: 62 }));
  it('startup inset only for the iPhone home-screen app in landscape', () => {
    const env = { standalone: true, userAgent: IPHONE_UA, landscape: true, screenW: 440, screenH: 956, innerHeight: 378, visualHeight: 378 };
    expect(startupInset(env)).toBe(62);
    expect(startupInset({ ...env, standalone: false })).toBe(0); // Safari tab: toolbars are legit
    expect(startupInset({ ...env, userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0)' })).toBe(0);
    expect(startupInset({ ...env, innerHeight: 430 })).toBe(0); // small differences are normal
  });
});

describe('lvh fill decision (the only band the page can paint)', () => {
  const base = { ...land, innerHeight: 378, visualHeight: 378, standalone: true, iphone: true, keyboardOpen: false };
  it('fills a layout-short window', () => expect(shouldFillLvh({ ...base, lvh: 440 })).toBe(true));
  it('never for window-short (would hide the bottom controls)', () => expect(shouldFillLvh({ ...base, lvh: 378 })).toBe(false));
  it('never with the keyboard up, in a browser tab, on iPad/Android/desktop or in portrait', () => {
    expect(shouldFillLvh({ ...base, lvh: 440, keyboardOpen: true })).toBe(false);
    expect(shouldFillLvh({ ...base, lvh: 440, standalone: false })).toBe(false);
    expect(shouldFillLvh({ ...base, lvh: 440, iphone: false })).toBe(false);
    expect(shouldFillLvh({ ...base, lvh: 440, landscape: false })).toBe(false);
  });
  it('a full window never fills', () => expect(shouldFillLvh({ ...base, innerHeight: 440, visualHeight: 440, lvh: 440 })).toBe(false));
});

describe('band layer diagnosis', () => {
  const ok = { band: 'full' as const, pageBottom: 390, rootBottom: 390, shellBottom: 390, stage: { w: 844, h: 300 }, canvas: { w: 533, h: 300 }, safeBottom: 0 };
  it('all layers reach the bottom → none', () => expect(diagnoseLayers(ok)).toEqual({ layer: 'none', px: 0 }));
  it('short web view → webkit', () => expect(diagnoseLayers({ ...ok, band: 'window-short' }).layer).toBe('webkit'));
  it('root shorter than the page → dom (e.g. a stale px height lock)', () => expect(diagnoseLayers({ ...ok, rootBottom: 330 })).toEqual({ layer: 'dom', px: 60 }));
  it('layout-short page not filled → dom', () => expect(diagnoseLayers({ ...ok, band: 'layout-short', pageBottom: 440, rootBottom: 378 }).layer).toBe('dom'));
  it('game shell shorter than the root → dom', () => expect(diagnoseLayers({ ...ok, shellBottom: 350 }).layer).toBe('dom'));
  it('canvas that did not re-fit its stage → canvas', () => expect(diagnoseLayers({ ...ok, canvas: { w: 400, h: 225 } }).layer).toBe('canvas'));
  it('letterboxing (one side touches) is not a canvas bug', () => expect(diagnoseLayers({ ...ok, canvas: { w: 844, h: 280 } }).layer).toBe('none'));
  it('gap equal to the home-indicator inset → safe-area', () => expect(diagnoseLayers({ ...ok, safeBottom: 21, controlsGap: 21 }).layer).toBe('safe-area'));
});

describe('viewport nudge', () => {
  it('toggles a no-op flag (WebKit re-reads the meta) and back', () => {
    const c = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
    const once = toggledViewportContent(c);
    expect(once).toBe(`${c}, shrink-to-fit=no`);
    expect(toggledViewportContent(once)).toBe(c);
  });
});

/* ---------- installViewport on a fake iPhone page (no DOM library needed) ---------- */
type Listener = { type: string; fn: unknown };
function fakePage(opts: { innerHeight: number; lvh: number; standalone: boolean }) {
  const live: Listener[] = [];
  const target = (name: string) => ({
    addEventListener: (type: string, fn: unknown) => live.push({ type: `${name}:${type}`, fn }),
    removeEventListener: (type: string, fn: unknown) => {
      const i = live.findIndex((l) => l.type === `${name}:${type}` && l.fn === fn);
      if (i >= 0) live.splice(i, 1);
    },
    dispatch(type: string) {
      for (const l of live.filter((x) => x.type === `${name}:${type}`)) (l.fn as () => void)();
    },
  });
  const classes = new Set<string>();
  const style = new Map<string, string>();
  let metaContent = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
  const win = target('window');
  const doc = target('document');
  const vv = Object.defineProperties(target('vv'), { height: { get: () => page.innerHeight }, offsetTop: { value: 0 } });
  const frames: (() => void)[] = [];
  const page = {
    innerHeight: opts.innerHeight,
    lvh: opts.lvh,
    live,
    classes,
    meta: () => metaContent,
    win,
    doc,
    flush() {
      while (frames.length) frames.shift()!();
    },
  };
  const root = {
    get clientHeight() { return page.innerHeight; },
    classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)), contains: (c: string) => classes.has(c), remove: (...c: string[]) => c.forEach((x) => classes.delete(x)) },
    style: { setProperty: (k: string, v: string) => style.set(k, v), removeProperty: (k: string) => style.delete(k), getPropertyValue: (k: string) => style.get(k) ?? '' },
  };
  const probe = { setAttribute() {}, style: {} as Record<string, string>, isConnected: false, getBoundingClientRect: () => ({ height: page.lvh }) };
  Object.defineProperty(win, 'innerHeight', { get: () => page.innerHeight });
  vi.stubGlobal('window', Object.assign(win, {
    visualViewport: vv,
    innerWidth: 956,
    scrollX: 0,
    scrollY: 0,
    scrollTo() {},
    setTimeout: (fn: () => void) => { frames.push(fn); return frames.length; },
    clearTimeout() {},
    matchMedia: (q: string) => ({ matches: opts.standalone && /standalone/.test(q) }),
  }));
  vi.stubGlobal('document', Object.assign(doc, {
    documentElement: root,
    activeElement: null,
    body: { appendChild() {} },
    createElement: () => probe,
    querySelector: () => ({ getAttribute: () => metaContent, setAttribute: (_: string, v: string) => (metaContent = v) }),
    visibilityState: 'visible',
  }));
  vi.stubGlobal('navigator', { userAgent: IPHONE_UA, standalone: opts.standalone });
  vi.stubGlobal('screen', { width: 440, height: 956, orientation: { type: 'landscape-primary' } });
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => { frames.push(fn); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('performance', { now: () => 0 });
  vi.stubGlobal('HTMLElement', class {});
  return page;
}

describe('installViewport (fake iPhone home-screen app)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fills the root for a layout-short launch and drops it once the window is full', () => {
    const page = fakePage({ innerHeight: 378, lvh: 440, standalone: true });
    const off = installViewport();
    page.flush();
    expect(page.classes.has('vp-fill-lvh')).toBe(true);
    page.innerHeight = 440;
    page.win.dispatch('resize');
    page.flush();
    expect(page.classes.has('vp-fill-lvh')).toBe(false);
    off();
  });

  it('window-short: at most MAX_NUDGES viewport re-reads per launch, a fresh budget on resume, never a loop', () => {
    const page = fakePage({ innerHeight: 378, lvh: 378, standalone: true });
    const off = installViewport();
    const start = page.meta();
    for (let i = 0; i < 10; i++) {
      page.win.dispatch('resize');
      page.flush();
    }
    const nudges = viewportEvents.filter((e) => e.what.startsWith('nudge')).length;
    expect(nudges).toBe(MAX_NUDGES);
    expect(page.meta()).toBe(start); // two toggles = back to the original content
    expect(page.classes.has('vp-fill-lvh')).toBe(false); // never sized past the web view
    page.doc.dispatch('visibilitychange'); // resume → new bounded budget
    for (let i = 0; i < 10; i++) page.flush();
    expect(viewportEvents.filter((e) => e.what.startsWith('nudge')).length).toBe(nudges + MAX_NUDGES);
    off();
  });

  it('does nothing in a Safari tab (toolbars legitimately take height)', () => {
    const page = fakePage({ innerHeight: 300, lvh: 440, standalone: false });
    const before = viewportEvents.length;
    const off = installViewport();
    page.flush();
    expect(page.classes.size).toBe(0);
    expect(viewportEvents.length).toBe(before);
    off();
  });

  it('removes every listener it added', () => {
    const page = fakePage({ innerHeight: 440, lvh: 440, standalone: true });
    const off = installViewport();
    expect(page.live.length).toBeGreaterThan(5);
    off();
    expect(page.live).toEqual([]);
    expect(page.classes.size).toBe(0);
  });
});
