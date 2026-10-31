import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { deviceClass } from '../lib/device';
import { requiredOrientation, useOrientation, type Orientation } from '../lib/orientation';
import { useSession } from '../store/session';
import { KeyoLogo } from './KeyoLogo';

/**
 * Asks phone/tablet players to rotate: sign-in, sign-up and password recovery want portrait; the
 * lobby, rooms and everything after sign-in want landscape. PCs never see it. It is only a layer
 * on top: the page under it stays mounted, so forms, the session and room state are untouched, and
 * it disappears by itself once the device is turned. No rotation lock API is used.
 */
export function OrientationGuard() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const user = useSession((s) => s.user);
  const orientation = useOrientation();
  if (deviceClass() !== 'mobile') return null;
  const want = requiredOrientation({ signedIn: !!user, verified: user?.status !== 'pending_verification', pathname });
  if (orientation === want) return null;
  const key = want === 'landscape' ? 'landscape' : 'portrait';
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="orientation-title"
      aria-describedby="orientation-body"
      data-orientation-guard={want}
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_50%_25%,#2a1a66,#0b0822_62%,#05040f)] p-[max(1.25rem,env(safe-area-inset-top))_max(1.25rem,env(safe-area-inset-right))_max(1.25rem,env(safe-area-inset-bottom))_max(1.25rem,env(safe-area-inset-left))]"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border border-gold-300/45 bg-black/45 px-6 py-7 text-center shadow-[0_0_40px_-12px_rgba(242,193,78,0.55)] backdrop-blur short:max-w-md short:flex-row short:gap-5 short:py-4 short:text-left">
        <div className="flex shrink-0 flex-col items-center gap-3">
          <KeyoLogo size={52} />
          <RotateIcon to={want} />
        </div>
        <div className="flex flex-col gap-2">
          <h2 id="orientation-title" className="font-display text-xl font-bold text-gold-100">{t(`app.orientation.${key}Title`)}</h2>
          <p id="orientation-body" className="text-sm leading-relaxed text-white/75">{t(`app.orientation.${key}Body`)}</p>
          <p className="text-xs text-white/45">{t('app.orientation.hint')}</p>
        </div>
      </div>
    </div>
  );
}

/** A phone outline turning toward the wanted orientation (static when motion is reduced). */
function RotateIcon({ to }: { to: Orientation }) {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden className={to === 'landscape' ? 'orientation-turn-landscape' : 'orientation-turn-portrait'}>
      <rect x="20" y="8" width="24" height="44" rx="5" stroke="#f2c14e" strokeWidth="3" fill="rgba(242,193,78,0.08)" />
      <circle cx="32" cy="46" r="1.8" fill="#f2c14e" />
      <path d="M52 30a20 20 0 0 0-10-17" stroke="#ffe08a" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M41 9l1 5 5-1" stroke="#ffe08a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
