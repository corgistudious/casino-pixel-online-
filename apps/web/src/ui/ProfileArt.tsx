import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { keyoUrl, KeyoImg } from '../assets/keyo';

/**
 * Asset Studio art for profile pages (own profile and public profiles). Decoration only, chosen from
 * real data (VIP level, Partner badge); nothing here grants or changes anything.
 */

/** Stage banner behind the profile header (cover, darkened for text contrast). */
export function ProfileBanner() {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <img src={keyoUrl('profile.header', 1024)} alt="" decoding="async" draggable={false} onError={() => setFailed(true)} data-keyo-asset="profile.header" className="h-full w-full select-none object-cover object-center" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0614]/90 via-[#0b0614]/65 to-[#0b0614]/35" />
    </div>
  );
}

/** Soft page backdrop for profile pages (behind every section, very low contrast). */
export function ProfileBackdrop() {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden">
      <img src={keyoUrl('profile.background', 1024)} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} data-keyo-asset="profile.background" className="h-full w-full select-none object-cover opacity-25" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#07060f]/60 to-[#07060f]" />
    </div>
  );
}

/** Prestige aura behind the avatar from VIP 13 (royal tier). Static under reduced motion. */
export const PRESTIGE_VIP = 13;
export function PrestigeAura({ vipLevel, size, children }: { vipLevel: number; size: number; children: ReactNode }) {
  if (vipLevel < PRESTIGE_VIP) return <>{children}</>;
  const box = Math.round(size * 1.75);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div aria-hidden className="pointer-events-none absolute motion-safe:animate-[pulse_4s_ease-in-out_infinite]" style={{ width: box, height: box, left: (size - box) / 2, top: (size - box) / 2 }}>
        <KeyoImg id="profile.prestige-effect" size={box} alt="" decorative />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

/** Accent marks next to the name: VIP accent from VIP 10, KOL accent for Partner (KOL) accounts. */
export function ProfileAccents({ vipLevel, partner }: { vipLevel: number; partner: boolean }) {
  const { t } = useTranslation();
  if (vipLevel < 10 && !partner) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {vipLevel >= 10 && <KeyoImg id="profile.accent-vip" size={24} alt={`VIP ${vipLevel}`} title={`VIP ${vipLevel}`} />}
      {partner && <KeyoImg id="profile.accent-kol" size={24} alt={t('badges.partner')} title={t('badges.partner')} />}
    </span>
  );
}
