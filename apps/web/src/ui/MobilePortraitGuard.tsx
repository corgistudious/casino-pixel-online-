import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { formFactor } from '../lib/device';
import { phoneMustRotate, useOrientation } from '../lib/orientation';
import { KeyoLogo } from './KeyoLogo';

/**
 * V7.1 — phones are portrait-only. When a PHONE is held sideways (browser or home-screen app), this
 * opaque notice covers the whole visible area and the app underneath is made inert (no taps, no
 * keyboard focus, hidden from screen readers). Nothing is unmounted, reloaded or navigated: the page,
 * the session, the WebSocket and any running round keep going (the server stays the clock), and the
 * notice disappears by itself when the phone is turned back. No orientation lock API, no CSS rotation.
 * Tablets and PCs never see it (lib/device.ts formFactor), even in a narrow window.
 */
export function MobilePortraitGuard() {
  const { t } = useTranslation();
  const orientation = useOrientation();
  const show = phoneMustRotate(formFactor(), orientation);

  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    if (show) {
      root.setAttribute('inert', '');
      root.setAttribute('aria-hidden', 'true');
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
    return () => {
      root.removeAttribute('inert');
      root.removeAttribute('aria-hidden');
    };
  }, [show]);

  if (!show) return null;
  return createPortal(
    <div role="alertdialog" aria-modal="true" aria-labelledby="portrait-guard-title" aria-describedby="portrait-guard-body" data-portrait-guard className="portrait-guard">
      <div className="portrait-guard-card">
        <div className="portrait-guard-art">
          <KeyoLogo size={56} />
          <PhoneTurnIcon />
        </div>
        <div className="portrait-guard-text">
          <h2 id="portrait-guard-title">{t('app.orientation.portraitTitle')}</h2>
          <p id="portrait-guard-body">{t('app.orientation.portraitBody')}</p>
          <p className="portrait-guard-hint">{t('app.orientation.hint')}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A phone outline turning from landscape to portrait (static when motion is reduced). */
function PhoneTurnIcon() {
  return (
    <svg width="72" height="72" viewBox="0 0 64 64" fill="none" aria-hidden className="portrait-guard-phone">
      <defs>
        <linearGradient id="pg-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset=".5" stopColor="#f2c14e" />
          <stop offset="1" stopColor="#b9801c" />
        </linearGradient>
      </defs>
      <g className="portrait-guard-phone-body">
        <rect x="20" y="8" width="24" height="44" rx="5" stroke="url(#pg-gold)" strokeWidth="3" fill="rgba(242,193,78,0.10)" />
        <circle cx="32" cy="46" r="1.8" fill="#f2c14e" />
      </g>
      <path d="M52 30a20 20 0 0 0-10-17" stroke="#ffe08a" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M41 9l1 5 5-1" stroke="#ffe08a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
