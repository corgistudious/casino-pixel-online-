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

function current(): Orientation {
  const w = window as Window & { orientation?: number };
  return readOrientation({
    screenType: typeof screen !== 'undefined' ? screen.orientation?.type ?? null : null,
    legacyAngle: typeof w.orientation === 'number' ? w.orientation : null,
    mediaPortrait: typeof window.matchMedia === 'function' && window.matchMedia('(orientation: portrait)').matches,
  });
}

/** Live orientation: follows rotations without reloading or remounting anything. */
export function useOrientation(): Orientation {
  const [o, setO] = useState<Orientation>(() => (typeof window === 'undefined' ? 'landscape' : current()));
  useEffect(() => {
    const update = () => setO(current());
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

/** Sign-in, sign-up and password recovery are portrait; everything after sign-in is landscape. */
export function requiredOrientation(opts: { signedIn: boolean; verified: boolean; pathname: string }): Orientation {
  const linkPage = ['/verify-email', '/reset-password', '/activate', '/captain-setup'].includes(opts.pathname);
  if (!opts.signedIn || !opts.verified || linkPage) return 'portrait';
  return 'landscape';
}
