/**
 * User-initiated fullscreen (Fullscreen API) for the game HUD.
 *
 * - Only offered where the browser really supports element fullscreen: Android Chrome/Edge/Firefox,
 *   desktop browsers, iPadOS Safari (webkit-prefixed). iPhone Safari has no element fullscreen, so
 *   the button is hidden there — the page uses the viewport Safari gives it and the home-screen app
 *   uses its standalone window (safe areas respected). Nothing tries to hide the address bar.
 * - Never requested automatically: browsers require a user gesture, so it is called only from a click.
 * - Already running as an installed fullscreen/standalone app → not offered (nothing to gain).
 * - Leaving is always possible with the same button, Esc, or the system back gesture.
 */
import { useSyncExternalStore } from 'react';

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => Promise<void> | void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

export interface FullscreenEnv {
  enabled: boolean;
  webkitEnabled: boolean;
  userAgent: string;
  installedApp: boolean;
}

/** Pure: should the HUD offer a fullscreen toggle? */
export function canOfferFullscreen(env: FullscreenEnv): boolean {
  if (env.installedApp) return false;
  if (/iPhone|iPod/.test(env.userAgent)) return false;
  return env.enabled || env.webkitEnabled;
}

function doc(): FsDoc {
  return document as FsDoc;
}

export function fullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null;
  return doc().fullscreenElement ?? doc().webkitFullscreenElement ?? null;
}

export function fullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const mq = (q: string) => typeof window.matchMedia === 'function' && window.matchMedia(q).matches;
  const nav = navigator as Navigator & { standalone?: boolean };
  return canOfferFullscreen({
    enabled: !!doc().fullscreenEnabled,
    webkitEnabled: !!doc().webkitFullscreenEnabled,
    userAgent: navigator.userAgent ?? '',
    installedApp: nav.standalone === true || mq('(display-mode: standalone)') || (mq('(display-mode: fullscreen)') && !fullscreenElement()),
  });
}

/** Toggle from a click handler. Failures (denied, unsupported) are ignored: the layout already fits. */
export async function toggleFullscreen(): Promise<void> {
  try {
    if (fullscreenElement()) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else await doc().webkitExitFullscreen?.();
      return;
    }
    const el = document.documentElement as FsEl;
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else await el.webkitRequestFullscreen?.();
  } catch {
    /* not allowed here — keep the windowed layout */
  }
}

function subscribe(cb: () => void): () => void {
  document.addEventListener('fullscreenchange', cb);
  document.addEventListener('webkitfullscreenchange', cb);
  return () => {
    document.removeEventListener('fullscreenchange', cb);
    document.removeEventListener('webkitfullscreenchange', cb);
  };
}

export function useFullscreen(): { supported: boolean; active: boolean } {
  const active = useSyncExternalStore(subscribe, () => fullscreenElement() !== null, () => false);
  return { supported: fullscreenSupported(), active };
}
