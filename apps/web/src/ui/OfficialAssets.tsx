import { useTranslation } from 'react-i18next';
import type { Badge, Currency } from '@casino/shared';

/**
 * Official artwork. Originals: assets/official/ (repository root).
 * Web copies (resized only): apps/web/public/assets/official/ — regenerate with
 * `python3 scripts/build-official-assets.py` when an original changes.
 */
export const OFFICIAL_ASSETS = {
  silver: 'assets/official/cxu-bac.png',
  gold: 'assets/official/cxu-vang.png',
  partner: 'assets/official/badge-partner.png',
  verified: 'assets/official/badge-verified.png',
} as const;

function OfficialImage({ src, size, alt, title }: { src: string; size: number; alt: string; title?: string }) {
  return (
    <img
      src={src}
      alt={alt}
      title={title ?? alt}
      width={size}
      height={size}
      draggable={false}
      loading="lazy"
      decoding="async"
      className="inline-block shrink-0 select-none object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.45)]"
      style={{ width: size, height: size }}
    />
  );
}

export function CurrencyIcon({ currency, size = 20 }: { currency: Currency; size?: number }) {
  const { t } = useTranslation();
  return <OfficialImage src={OFFICIAL_ASSETS[currency]} size={size} alt={t(`currency.${currency}`)} />;
}

export function BadgeIcon({ badge, size = 18 }: { badge: Badge; size?: number }) {
  const { t } = useTranslation();
  const name = t(`badges.${badge}`);
  return <OfficialImage src={OFFICIAL_ASSETS[badge]} size={size} alt={name} title={`${name} — ${t(`badges.${badge}Desc`)}`} />;
}

/** Display name with badges, used everywhere a player is shown. */
export function PlayerName({ name, badges, size = 16, className = '' }: { name: string; badges: readonly Badge[]; size?: number; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      <span className="truncate">{name}</span>
      {badges.map((b) => (
        <BadgeIcon key={b} badge={b} size={size} />
      ))}
    </span>
  );
}

/** Amount with its currency icon. */
export function Amount({ currency, value, size = 16, className = '' }: { currency: Currency; value: string; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${className}`}>
      <CurrencyIcon currency={currency} size={size} />
      {value}
    </span>
  );
}
