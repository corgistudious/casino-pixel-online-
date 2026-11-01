/**
 * PWA (home-screen app) block. Owner decision: the standalone app mode is not supported on iOS
 * (iPhone, iPad) and Android for now — players use Safari / Chrome / any normal browser instead.
 *
 * - Only the INSTALLED app is blocked: `navigator.standalone` (iOS) or the `display-mode` media
 *   query (standalone / fullscreen — the manifest asks for fullscreen; a page cannot start in the
 *   Fullscreen API, so at start-up `fullscreen` only means the installed app). A normal browser tab
 *   on the same phone, and every PC (installed desktop PWAs included), are never blocked.
 * - Decided ONCE at start-up, before the game mounts. No redirect, no reload, nothing is deleted
 *   (session, storage, caches all stay), so turning the block off restores the app as it was.
 *
 * Configuration (to restore the app later, no code change):
 * - build time: VITE_PWA_BLOCK = all (default) | ios | android | off;
 * - run time (wins when valid): an optional `/pwa-policy.json` next to index.html, e.g.
 *   {"ios": false, "android": false} to allow both again, or {"url": "https://…"} for the link
 *   shown. Fetched only by an installed mobile app (never by browsers), no-store, 1.5 s timeout;
 *   missing / invalid / slow → the build-time value (fail-safe: the configured state holds).
 */
export type PwaPlatform = 'ios' | 'android' | 'other';
export interface PwaPolicy {
  ios: boolean;
  android: boolean;
  url: string;
}

export const DEFAULT_PWA_URL = 'https://play.keyogame.com';
export const POLICY_PATH = './pwa-policy.json';
const POLICY_TIMEOUT_MS = 1500;

export interface PlatformEnv {
  userAgent: string;
  uaPlatform?: string | null;
  maxTouchPoints: number;
}

/** Pure: which mobile OS (never decides on its own whether to block). */
export function pwaPlatform(env: PlatformEnv): PwaPlatform {
  const p = env.uaPlatform?.toLowerCase() ?? '';
  if (p === 'android' || /Android/i.test(env.userAgent)) return 'android';
  if (p === 'ios' || /iPhone|iPod|iPad/i.test(env.userAgent)) return 'ios';
  // iPadOS 13+ reports a Mac; no Mac has a touchscreen.
  if (/Macintosh/i.test(env.userAgent) && env.maxTouchPoints > 1) return 'ios';
  return 'other';
}

export interface StandaloneEnv {
  /** navigator.standalone (iOS Safari only; undefined elsewhere). */
  navigatorStandalone: boolean | undefined;
  displayStandalone: boolean;
  displayFullscreen: boolean;
  /** document.fullscreenElement !== null (Fullscreen API in a normal tab). */
  fullscreenApi: boolean;
}

/** Pure: is the page running as the installed home-screen app? */
export function isInstalledApp(env: StandaloneEnv): boolean {
  if (env.navigatorStandalone === true) return true;
  if (env.displayStandalone) return true;
  return env.displayFullscreen && !env.fullscreenApi;
}

/** Pure: build-time flag → policy. Unknown values fall back to the default (block both). */
export function policyFromFlag(flag: string | undefined, url: string | undefined): PwaPolicy {
  const f = (flag ?? '').trim().toLowerCase();
  const link = validUrl(url) ?? DEFAULT_PWA_URL;
  if (f === 'off' || f === 'none' || f === '0') return { ios: false, android: false, url: link };
  if (f === 'ios') return { ios: true, android: false, url: link };
  if (f === 'android') return { ios: false, android: true, url: link };
  return { ios: true, android: true, url: link };
}

function validUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' ? u.toString().replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

/** Pure: apply a runtime override (only well-typed fields count); anything else keeps `base`. */
export function mergePolicy(base: PwaPolicy, raw: unknown): PwaPolicy {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const r = raw as Record<string, unknown>;
  return {
    ios: typeof r.ios === 'boolean' ? r.ios : base.ios,
    android: typeof r.android === 'boolean' ? r.android : base.android,
    url: validUrl(r.url) ?? base.url,
  };
}

/** Pure: the decision. */
export function shouldBlock(policy: PwaPolicy, platform: PwaPlatform, installed: boolean): boolean {
  if (!installed) return false;
  if (platform === 'ios') return policy.ios;
  if (platform === 'android') return policy.android;
  return false;
}

function currentEnv() {
  const nav = navigator as Navigator & { standalone?: boolean; userAgentData?: { platform?: string } };
  const mq = (q: string) => typeof window.matchMedia === 'function' && window.matchMedia(q).matches;
  return {
    platform: pwaPlatform({ userAgent: nav.userAgent ?? '', uaPlatform: nav.userAgentData?.platform ?? null, maxTouchPoints: nav.maxTouchPoints ?? 0 }),
    installed: isInstalledApp({
      navigatorStandalone: nav.standalone,
      displayStandalone: mq('(display-mode: standalone)'),
      displayFullscreen: mq('(display-mode: fullscreen)'),
      fullscreenApi: !!document.fullscreenElement,
    }),
  };
}

async function fetchPolicy(): Promise<unknown> {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = window.setTimeout(() => ctrl?.abort(), POLICY_TIMEOUT_MS);
  try {
    const res = await fetch(POLICY_PATH, { cache: 'no-store', signal: ctrl?.signal, credentials: 'omit' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null; // SPA fallback serves index.html
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Start-up decision: null = run the game; otherwise the policy to show the notice with.
 * Browsers and PCs return immediately (no request); only an installed mobile app reads the runtime
 * policy.
 */
export async function resolvePwaBlock(): Promise<PwaPolicy | null> {
  if (typeof window === 'undefined') return null;
  const base = policyFromFlag(import.meta.env.VITE_PWA_BLOCK, import.meta.env.VITE_PWA_BLOCK_URL);
  const { platform, installed } = currentEnv();
  if (!installed || platform === 'other') return null;
  const policy = mergePolicy(base, await fetchPolicy());
  return shouldBlock(policy, platform, installed) ? policy : null;
}
