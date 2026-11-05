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

/**
 * V7.1 (final): phones play in LANDSCAPE. Returns true when the rotate-to-landscape notice must cover
 * the app: a phone held upright, outside the sign-in / link pages. Tablets and PCs are never asked.
 */
export function phoneMustRotate(form: 'phone' | 'tablet' | 'pc', orientation: Orientation, authRoute = false): boolean {
  return form === 'phone' && orientation === 'portrait' && !authRoute;
}
