import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { currentStartupInset } from '../lib/viewportProbe';

/**
 * iPhone home-screen app only: when iOS opens Keyo in landscape with a window shorter than the
 * screen (the portrait status-bar reservation carried into landscape — see lib/viewportProbe.ts),
 * the page cannot draw into the missing band. Explain the one fix that works (relaunch from the App
 * Switcher). Shown once per session, only after the condition has lasted 1.5 s, hidden as soon as
 * the window is full again. Never reloads and never resizes anything.
 */
const SEEN_KEY = 'keyo.iosWindowHint';
const PERSIST_MS = 1500;

export function StandaloneInsetHint() {
  const { t } = useTranslation();
  const [inset, setInset] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(SEEN_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (dismissed) return;
    let timer: number | undefined;
    const check = () => {
      window.clearTimeout(timer);
      const now = currentStartupInset();
      if (!now) return setInset(0);
      // Only a condition that persists: rotation and launch animations pass through short sizes.
      timer = window.setTimeout(() => setInset(currentStartupInset()), PERSIST_MS);
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    window.visualViewport?.addEventListener('resize', check);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
      window.visualViewport?.removeEventListener('resize', check);
    };
  }, [dismissed]);

  if (dismissed || !inset) return null;
  const dismiss = () => {
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* storage unavailable */
    }
    setDismissed(true);
  };
  return (
    <div
      role="status"
      data-testid="ios-window-hint"
      className="fixed left-1/2 top-[max(0.5rem,env(safe-area-inset-top))] z-[70] flex w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 rounded-xl border border-gold-300/40 bg-ink-950/92 px-3 py-2 text-xs leading-snug text-white/85 shadow-lg backdrop-blur"
    >
      <div className="flex-1">
        <p className="font-bold text-gold-100">{t('iosWindow.title')}</p>
        <p className="mt-0.5 text-white/70">{t('iosWindow.body', { px: inset })}</p>
      </div>
      <button type="button" onClick={dismiss} className="shrink-0 rounded-lg border border-white/20 px-2 py-1 text-[11px] font-semibold text-white/85 hover:bg-white/10">
        {t('iosWindow.dismiss')}
      </button>
    </div>
  );
}
