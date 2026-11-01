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
  const mm = (q: string) => typeof window.matchMedia === 'function' && window.matchMedia(q).matches;
  const vv = window.visualViewport;
  return {
    screen: `${screen.width}x${screen.height}`,
    inner: `${window.innerWidth}x${window.innerHeight}`,
    client: `${document.documentElement.clientWidth}x${document.documentElement.clientHeight}`,
    visual: vv ? `${Math.round(vv.width)}x${Math.round(vv.height)} @${Math.round(vv.offsetTop)}` : 'n/a',
    root: root ? `${Math.round(root.width)}x${Math.round(root.height)}` : 'n/a',
    orientation: screen.orientation?.type ?? String((window as Window & { orientation?: number }).orientation ?? 'n/a'),
    navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone ?? null,
    displayMode: ['fullscreen', 'standalone', 'minimal-ui', 'browser'].find((m) => mm(`(display-mode: ${m})`)) ?? 'unknown',
    statusBarMeta: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.getAttribute('content') ?? 'absent',
    viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? 'absent',
    safeArea: safe,
    dpr: window.devicePixelRatio,
    startupInset: currentStartupInset(),
  };
}
