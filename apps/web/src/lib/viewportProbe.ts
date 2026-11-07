/**
 * iOS home-screen app (PWA) window diagnostics.
 *
 * Observed on iPhone (screen 440×956): when the home screen is in portrait, the phone is turned to
 * landscape and the app is then opened, iOS gives the page a 956×378 window: innerHeight,
 * documentElement.clientHeight and visualViewport.height all agree on 378, i.e. the window itself is
 * 62 px short (62 px = the portrait top safe area: the status-bar reservation carried into
 * landscape). Nothing inside the page can draw outside its window, which is why reloading does not
 * help and relaunching from the App Switcher (iOS rebuilds the window in landscape) does.
 *
 * The app therefore never sizes itself beyond the window it is given (that would push its bottom
 * controls out of sight); it detects the condition so it can be explained to the player and
 * measured in the Test build.
 */

export interface InsetEnv {
  /** Running as a home-screen app (navigator.standalone or display-mode standalone/fullscreen). */
  standalone: boolean;
  userAgent: string;
  landscape: boolean;
  screenW: number;
  screenH: number;
  innerHeight: number;
  visualHeight: number | null;
}

/** A short window is reported only for a clear, iOS-sized gap; smaller differences are normal. */
export const STARTUP_INSET_MIN_PX = 40;

/**
 * Pure: how many px iOS withheld from an iPhone home-screen app window in landscape (0 = none).
 * Never on iPad (Split View / Stage Manager windows are legitimately smaller), Android, desktop or a
 * Safari tab (its toolbars legitimately take height).
 */
export function startupInset(env: InsetEnv): number {
  if (!env.standalone || !env.landscape || !/iPhone|iPod/.test(env.userAgent)) return 0;
  const short = Math.min(env.screenW, env.screenH);
  if (!short || !env.innerHeight) return 0;
  const visible = Math.max(env.innerHeight, env.visualHeight ?? 0);
  const gap = Math.round(short - visible);
  return gap >= STARTUP_INSET_MIN_PX ? gap : 0;
}

/**
 * Pure: WHERE a missing strip is, from what WebKit reports (Test diagnostics; changes nothing).
 * - 'full'         the page has the whole screen side.
 * - 'layout-short' WebKit's large viewport (100lvh) still spans the screen but the layout viewport
 *                  (innerHeight) is shorter: the web view extends into the strip and app code could
 *                  size into it (a paint test turns the strip magenta).
 * - 'window-short' 100lvh is short too: the web view itself is shorter than the screen. The strip
 *                  is outside the page (an iOS system area); no CSS/JS can paint it.
 */
export type BandVerdict = 'full' | 'layout-short' | 'window-short';
export interface BandEnv { landscape: boolean; screenW: number; screenH: number; innerHeight: number; visualHeight: number | null; lvh: number | null }
export function classifyBand(e: BandEnv): { verdict: BandVerdict; gap: number } {
  const expected = e.landscape ? Math.min(e.screenW, e.screenH) : Math.max(e.screenW, e.screenH);
  const visible = Math.max(e.innerHeight, e.visualHeight ?? 0);
  const gap = Math.round(expected - visible);
  if (!expected || !visible || gap < 20) return { verdict: 'full', gap: Math.max(0, gap) };
  if (e.lvh !== null && e.lvh >= expected - 4) return { verdict: 'layout-short', gap };
  return { verdict: 'window-short', gap };
}

/** Heights of the CSS viewport units (px), measured with hidden probes. */
export function viewportUnits(): Record<'vh' | 'svh' | 'lvh' | 'dvh', number | null> {
  const out = { vh: null, svh: null, lvh: null, dvh: null } as Record<'vh' | 'svh' | 'lvh' | 'dvh', number | null>;
  for (const u of Object.keys(out) as (keyof typeof out)[]) {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;top:0;left:0;width:1px;visibility:hidden;pointer-events:none;height:100${u}`;
    document.body.appendChild(el);
    const h = el.getBoundingClientRect().height;
    el.remove();
    out[u] = h > 0 ? Math.round(h) : null; // unsupported unit → 0 height
  }
  return out;
}

/** The element stack at the bottom edge of the window (which element paints the last row). */
function bottomStack(): string[] {
  const y = Math.max(0, window.innerHeight - 1);
  const els = typeof document.elementsFromPoint === 'function' ? document.elementsFromPoint(window.innerWidth / 2, y) : [];
  return els.slice(0, 4).map((el) => {
    const r = el.getBoundingClientRect();
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className ? `.${el.className.split(/\s+/).slice(0, 2).join('.')}` : ''} [${Math.round(r.top)}..${Math.round(r.bottom)}]`;
  });
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return typeof window.matchMedia === 'function' && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches);
}

export function isLandscapeNow(): boolean {
  const type = typeof screen !== 'undefined' ? screen.orientation?.type : undefined;
  if (type) return type.startsWith('landscape');
  const angle = (window as Window & { orientation?: number }).orientation;
  if (typeof angle === 'number') return angle % 180 !== 0;
  return window.innerWidth > window.innerHeight;
}

export function currentStartupInset(): number {
  // The root already fills the strip (lib/viewport.ts, 'layout-short'): nothing is missing.
  if (document.documentElement.classList.contains('vp-fill-lvh')) return 0;
  return startupInset({
    standalone: isStandalone(),
    userAgent: navigator.userAgent,
    landscape: isLandscapeNow(),
    screenW: screen.width,
    screenH: screen.height,
    innerHeight: window.innerHeight,
    visualHeight: window.visualViewport?.height ?? null,
  });
}

/** Everything that decides the window size, for the Test-build diagnostics overlay. */
export function sampleViewport() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const safe = { top: cs.paddingTop, right: cs.paddingRight, bottom: cs.paddingBottom, left: cs.paddingLeft };
  probe.remove();
  const root = document.getElementById('root')?.getBoundingClientRect();
  const rect = (el: Element | null) => {
    if (!el) return 'n/a';
    const b = el.getBoundingClientRect();
    return `${Math.round(b.width)}x${Math.round(b.height)} @${Math.round(b.left)},${Math.round(b.top)}`;
  };
  const html = document.documentElement.getBoundingClientRect();
  const body = document.body.getBoundingClientRect();
  const units = viewportUnits();
  const landscape = isLandscapeNow();
  const mm = (q: string) => typeof window.matchMedia === 'function' && window.matchMedia(q).matches;
  const vv = window.visualViewport;
  return {
    screen: `${screen.width}x${screen.height}`,
    inner: `${window.innerWidth}x${window.innerHeight}`,
    client: `${document.documentElement.clientWidth}x${document.documentElement.clientHeight}`,
    visual: vv ? `${Math.round(vv.width)}x${Math.round(vv.height)} @${Math.round(vv.offsetLeft)},${Math.round(vv.offsetTop)} x${vv.scale.toFixed(2)}` : 'n/a',
    // Game layers: the shell (DOM), the stage and the Phaser canvas — tells a DOM band from a canvas band.
    gameShell: rect(document.querySelector('.game-shell')),
    stage: rect(document.querySelector('.gstage')),
    canvas: rect(document.querySelector('[data-table-skin] canvas')),
    root: root ? `${Math.round(root.width)}x${Math.round(root.height)}` : 'n/a',
    orientation: screen.orientation?.type ?? String((window as Window & { orientation?: number }).orientation ?? 'n/a'),
    angle: screen.orientation?.angle ?? (window as Window & { orientation?: number }).orientation ?? null,
    units,
    html: `${Math.round(html.width)}x${Math.round(html.height)} @${Math.round(html.top)}`,
    body: `${Math.round(body.width)}x${Math.round(body.height)} @${Math.round(body.top)}`,
    bottomStack: bottomStack(),
    band: classifyBand({ landscape, screenW: screen.width, screenH: screen.height, innerHeight: window.innerHeight, visualHeight: vv?.height ?? null, lvh: units.lvh }),
    navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone ?? null,
    displayMode: ['fullscreen', 'standalone', 'minimal-ui', 'browser'].find((m) => mm(`(display-mode: ${m})`)) ?? 'unknown',
    statusBarMeta: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.getAttribute('content') ?? 'absent',
    viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? 'absent',
    safeArea: safe,
    scroll: `${Math.round(window.scrollX)},${Math.round(window.scrollY)}`,
    keyboard: document.documentElement.classList.contains('keyboard-open'),
    vars: ['--vvt', '--vvh', '--kb'].map((v) => document.documentElement.style.getPropertyValue(v) || '-').join(' '),
    dpr: window.devicePixelRatio,
    startupInset: currentStartupInset(),
    fillLvh: document.documentElement.classList.contains('vp-fill-lvh'),
    layer: sampleLayer(units.lvh, landscape, safe.bottom),
    visibility: document.visibilityState,
    marks: bootMarks(),
  };
}

/** diagnoseLayers() on the live page. */
function sampleLayer(lvh: number | null, landscape: boolean, safeBottom: string) {
  const vv = window.visualViewport;
  const box = (sel: string) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { w: b.width, h: b.height, bottom: b.bottom };
  };
  const band = classifyBand({ landscape, screenW: screen.width, screenH: screen.height, innerHeight: window.innerHeight, visualHeight: vv?.height ?? null, lvh }).verdict;
  const filled = document.documentElement.classList.contains('vp-fill-lvh');
  const root = box('#root');
  const shell = box('.game-shell');
  const controls = [...document.querySelectorAll('.gbar button, .ptabbar, .gbar')].map((el) => el.getBoundingClientRect().bottom);
  const pageBottom = filled && lvh ? lvh : window.innerHeight;
  return diagnoseLayers({
    band,
    pageBottom,
    rootBottom: root?.bottom ?? 0,
    shellBottom: shell?.bottom ?? null,
    // The canvas fits its own frame (inside the stage's padding / rounded frame).
    stage: box('[data-table-skin]'),
    canvas: box('[data-table-skin] canvas'),
    safeBottom: parseFloat(safeBottom) || 0,
    controlsGap: controls.length ? Math.max(0, (root?.bottom ?? pageBottom) - Math.max(...controls)) : undefined,
  });
}

/** Boot milestones (performance marks set by main.tsx, App and PhaserView), ms since navigation start. */
export function bootMarks(): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return out;
  for (const m of performance.getEntriesByType('mark')) if (m.name.startsWith('keyo:')) out[m.name.slice(5)] = Math.round(m.startTime);
  const dcl = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.domContentLoadedEventEnd;
  if (dcl) out.domReady = Math.round(dcl);
  return out;
}

/** How this page started: a fresh launch, a reload, or a page iOS restored (bfcache / discarded tab). */
export function launchKind(): { navigation: string; wasDiscarded: boolean | null } {
  const nav = (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function' ? performance.getEntriesByType('navigation')[0] : undefined) as PerformanceNavigationTiming | undefined;
  return { navigation: nav?.type ?? 'unknown', wasDiscarded: (document as Document & { wasDiscarded?: boolean }).wasDiscarded ?? null };
}

/** Records a boot milestone once (cheap; no-op where the Performance API is missing). */
export function markBoot(name: string) {
  try {
    if (typeof performance !== 'undefined' && performance.getEntriesByName(`keyo:${name}`).length === 0) performance.mark(`keyo:${name}`);
  } catch {
    /* ignore */
  }
}

/**
 * Pure: which LAYER a missing strip at the bottom belongs to (diagnostics + regression tests).
 * - 'webkit'    the web view itself is short (classifyBand 'window-short'): iOS/WebKit owns the strip.
 * - 'dom'       the page is taller than the app root / game shell (a layout bug, app-owned).
 * - 'canvas'    the Phaser canvas did not re-fit its stage (neither side touches the stage).
 * - 'safe-area' nothing is missing; the strip is the home-indicator inset the controls step around.
 * - 'none'      every layer reaches the bottom.
 * Px inputs are bottoms/heights in CSS px; null = layer not on screen.
 */
export type BandLayer = 'none' | 'webkit' | 'dom' | 'canvas' | 'safe-area';
export interface LayerEnv {
  band: BandVerdict;
  /** Height the page can paint: innerHeight, or 100lvh when the root is filled to it (layout-short). */
  pageBottom: number;
  rootBottom: number;
  shellBottom: number | null;
  stage: { w: number; h: number } | null;
  canvas: { w: number; h: number } | null;
  safeBottom: number;
  /** The strip a player reports (px), when known; otherwise the gap under the lowest control. */
  controlsGap?: number;
}
export function diagnoseLayers(e: LayerEnv): { layer: BandLayer; px: number } {
  if (e.band === 'window-short') return { layer: 'webkit', px: 0 };
  if (e.rootBottom < e.pageBottom - 2) return { layer: 'dom', px: Math.round(e.pageBottom - e.rootBottom) };
  if (e.shellBottom !== null && e.shellBottom < e.rootBottom - 2) return { layer: 'dom', px: Math.round(e.rootBottom - e.shellBottom) };
  if (e.stage && e.canvas && e.canvas.w < e.stage.w - 2 && e.canvas.h < e.stage.h - 2) return { layer: 'canvas', px: Math.round(e.stage.h - e.canvas.h) };
  if (e.controlsGap !== undefined && e.safeBottom > 0 && e.controlsGap > 2 && e.controlsGap <= e.safeBottom + 4) return { layer: 'safe-area', px: Math.round(e.controlsGap) };
  return { layer: 'none', px: 0 };
}

/**
 * Pure: should the app root be sized to 100lvh instead of the layout viewport? Only for the one case
 * the page CAN fix: an iPhone home-screen app in landscape whose layout viewport (innerHeight) is short
 * while WebKit's large viewport still spans the screen ('layout-short': the web view extends under the
 * strip, which otherwise shows the bare page background as a dark band). Never while a keyboard is up,
 * never in a Safari tab / iPad / Android / desktop, never for 'window-short' (outside the web view:
 * sizing past it would hide the bottom controls).
 */
export function shouldFillLvh(e: BandEnv & { standalone: boolean; iphone: boolean; keyboardOpen: boolean }): boolean {
  if (!e.standalone || !e.iphone || !e.landscape || e.keyboardOpen) return false;
  return classifyBand(e).verdict === 'layout-short';
}

/** The height of 100lvh in px (one hidden probe element, reused). null where unsupported. */
let lvhProbe: HTMLDivElement | null = null;
export function measureLvh(): number | null {
  if (typeof document === 'undefined' || !document.body) return null;
  if (!lvhProbe || !lvhProbe.isConnected) {
    lvhProbe = document.createElement('div');
    lvhProbe.setAttribute('aria-hidden', 'true');
    lvhProbe.style.cssText = 'position:fixed;top:0;left:-2px;width:1px;height:100lvh;visibility:hidden;pointer-events:none';
    document.body.appendChild(lvhProbe);
  }
  const h = lvhProbe.getBoundingClientRect().height;
  return h > 0 ? Math.round(h) : null;
}
