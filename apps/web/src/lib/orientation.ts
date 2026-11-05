import { useEffect, useState } from 'react';

export type Orientation = 'portrait' | 'landscape';

export interface OrientationEnv {
  /** screen.orientation.type (Chrome, Android, Safari 16.4+). */
  screenType?: string | null;
  /** Legacy window.orientation in degrees (older iOS Safari). */
  legacyAngle?: number | null;
  /** matchMedia('(orientation: portrait)'). */
  mediaPortrait: boolean;
}

/**
 * The PHYSICAL screen orientation. The screen APIs are preferred over the viewport media query
 * because an on-screen keyboard shrinks the viewport: typing in portrait on Android would otherwise
 * read as "landscape" and wrongly cover the sign-in form.
 */
export function readOrientation(env: OrientationEnv): Orientation {
  if (env.screenType) return env.screenType.startsWith('portrait') ? 'portrait' : 'landscape';
  if (typeof env.legacyAngle === 'number') return env.legacyAngle % 180 === 0 ? 'portrait' : 'landscape';
  return env.mediaPortrait ? 'portrait' : 'landscape';
}

/** The device's physical orientation right now (see readOrientation). */
export function currentOrientation(): Orientation {
  const w = window as Window & { orientation?: number };
  return readOrientation({
    screenType: typeof screen !== 'undefined' ? screen.orientation?.type ?? null : null,
    legacyAngle: typeof w.orientation === 'number' ? w.orientation : null,
    mediaPortrait: typeof window.matchMedia === 'function' && window.matchMedia('(orientation: portrait)').matches,
  });
}

/** Live orientation: follows rotations without reloading or remounting anything. */
export function useOrientation(): Orientation {
  const [o, setO] = useState<Orientation>(() => (typeof window === 'undefined' ? 'landscape' : currentOrientation()));
  useEffect(() => {
    const update = () => setO(currentOrientation());
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(orientation: portrait)') : null;
    screen.orientation?.addEventListener?.('change', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener('resize', update);
    mq?.addEventListener?.('change', update);
    update();
    return () => {
      screen.orientation?.removeEventListener?.('change', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('resize', update);
      mq?.removeEventListener?.('change', update);
    };
  }, []);
  return o;
}

/** Sign-in, sign-up, password recovery and e-mail link pages: usable in either orientation (typing). */
export function isAuthRoute(opts: { signedIn: boolean; verified: boolean; pathname: string }): boolean {
  const linkPage = ['/verify-email', '/reset-password', '/activate', '/captain-setup'].includes(opts.pathname);
  return !opts.signedIn || !opts.verified || linkPage;
}

/** Game rooms (a Phaser scene or the Blackjack table is mounted): /play/*, /tables/*, /bjt/<id>, /cards/*. */
export function isGameRoute(pathname: string): boolean {
  return /^\/(play|tables|cards)\/[^/]+/.test(pathname) || /^\/bjt\/[^/]+/.test(pathname);
}

/**
 * V7.1: who must turn the device sideways (the rotate notice covers the app, nothing unmounts).
 * - Phones: always in portrait, except the sign-in / e-mail link pages (typing).
 * - Tablets: only inside a game room. Game rooms are designed landscape-only on tablets, so turning a
 *   tablet upright mid-round never switches the table to another layout: the scene, its timer, the
 *   bets and the WebSocket keep running under the notice, and the table comes back exactly as it was.
 *   Lobby and secondary pages stay usable upright (responsive portrait layout).
 * - PCs: never (a window has no physical orientation).
 */
export function mustRotateToLandscape(form: 'phone' | 'tablet' | 'pc', orientation: Orientation, opts: { authRoute?: boolean; gameRoute?: boolean } = {}): boolean {
  if (orientation !== 'portrait') return false;
  if (form === 'phone') return !opts.authRoute;
  if (form === 'tablet') return !!opts.gameRoute && !opts.authRoute;
  return false;
}

/** Game tables use their landscape layout on phones and tablets; only a tall PC window gets portrait. */
export function tablePortraitLayout(form: 'phone' | 'tablet' | 'pc', box: { w: number; h: number } | null): boolean {
  return form === 'pc' && !!box && box.h > box.w * 1.05;
}

/**
 * V7.1 (final): phones play in LANDSCAPE. Returns true when the rotate-to-landscape notice must cover
 * the app: a phone held upright, outside the sign-in / link pages. Tablets and PCs are never asked.
 */
export function phoneMustRotate(form: 'phone' | 'tablet' | 'pc', orientation: Orientation, authRoute = false): boolean {
  return form === 'phone' && orientation === 'portrait' && !authRoute;
}
