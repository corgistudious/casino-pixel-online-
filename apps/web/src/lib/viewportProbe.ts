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
    visibility: document.visibilityState,
    marks: bootMarks(),
  };
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
