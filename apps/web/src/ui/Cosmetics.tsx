import type { CatalogItem } from '@casino/shared';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { assetSrc, itemName, useCatalog } from '../store/catalog';

type Look = Pick<CatalogItem, 'assetUrl' | 'style'> | undefined;
/** An item that may not be in the catalog yet (admin editor preview). */
type Preview = Pick<CatalogItem, 'assetUrl' | 'style'> & Partial<Pick<CatalogItem, 'name'>>;
const colorsOf = (item: Look, fallback: string[]) => (item?.style?.colors?.length ? item.style.colors : fallback);
const isVuongGia = (item: Look) => item?.style?.art === 'vuong_gia';

/** Equipped title shown under a player's name: gradient lettering on a dark pill (never colour alone: it is text). */
export function TitleBadge({ itemId, size = 'md', item: given }: { itemId: string | null | undefined; size?: 'sm' | 'md'; item?: Preview }) {
  const { i18n } = useTranslation();
  const stored = useCatalog((c) => (itemId ? c.items[itemId] : undefined));
  const item = given ?? stored;
  if (!itemId) return null;
  const name = itemName(item, i18n.language, itemId);
  if (item?.assetUrl) return <img src={assetSrc(item.assetUrl)} alt={name} title={name} className={size === 'sm' ? 'h-5' : 'h-7'} />;
  const colors = colorsOf(item, ['#fff1b8', '#f2c14e']);
  return (
    <span
      className={`relative inline-flex items-center overflow-hidden rounded-full border border-white/15 bg-black/45 font-bold tracking-wide ${size === 'sm' ? 'px-2 py-px text-[11px]' : 'px-3 py-0.5 text-xs'}`}
      title={name}
    >
      <span className="bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(90deg, ${colors.join(', ')})` }}>
        {name}
      </span>
      {item?.style?.animated && <span className="sheen opacity-60" />}
    </span>
  );
}

/** A chat message drawn with the sender's bubble. Text stays high-contrast on every skin. */
export function ChatBubble({ itemId, children, mine = false, item: given }: { itemId: string | null | undefined; children: ReactNode; mine?: boolean; item?: Preview }) {
  const stored = useCatalog((c) => (itemId ? c.items[itemId] : undefined));
  const item = given ?? stored;
  const colors = colorsOf(item, ['#272048', '#3a3166']);
  const royal = isVuongGia(item);
  const radius = mine ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md';
  if (item?.assetUrl) {
    return (
      <div className={`relative max-w-xs px-4 py-2.5 text-sm font-medium text-white ${radius}`} style={{ backgroundImage: `url(${assetSrc(item.assetUrl)})`, backgroundSize: '100% 100%' }}>
        <span className="relative drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">{children}</span>
      </div>
    );
  }
  return (
    <div
      className={`relative max-w-xs px-4 py-2.5 text-sm font-medium text-white shadow-lg ${radius} ${royal ? 'border border-gold-300/80' : 'border border-white/10'}`}
      style={{ background: `linear-gradient(135deg, ${colors.slice(0, 2).join(', ')})`, boxShadow: royal ? '0 0 16px rgba(242,193,78,0.35)' : undefined }}
    >
      {royal && (
        <svg viewBox="0 0 24 16" className="absolute -top-3 left-3 h-4 w-6 drop-shadow" aria-hidden>
          <path d="M2 14 4 4l5 5 3-8 3 8 5-5 2 10z" fill="#f2c14e" stroke="#8a5a12" strokeWidth="0.8" />
        </svg>
      )}
      {item?.style?.animated && <span className="sheen rounded-[inherit] opacity-30" />}
      <span className="relative">{children}</span>
    </div>
  );
}

/** Card back (Poker, Liêng, Xì Tố). Purely decorative: a back never reveals a card. */
export function CardBack({ itemId, width = 64, item: given }: { itemId: string | null | undefined; width?: number; item?: Preview }) {
  const id = useId();
  const stored = useCatalog((c) => (itemId ? c.items[itemId] : undefined));
  const item = given ?? stored;
  const height = Math.round(width * 1.4);
  if (item?.assetUrl) return <img src={assetSrc(item.assetUrl)} alt="" width={width} height={height} className="rounded-md shadow-lg" />;
  const [a, b, c] = colorsOf(item, ['#7d1222', '#d42a44', '#f7d77a']) as [string, string, string?];
  const accent = c ?? '#f7d77a';
  const royal = isVuongGia(item);
  return (
    <svg width={width} height={height} viewBox="0 0 100 140" role="img" aria-label={itemName(item, 'vi', itemId ?? 'card back')} className="shrink-0 drop-shadow-lg">
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={b} />
          <stop offset="1" stopColor={a} />
        </linearGradient>
        <pattern id={`${id}p`} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="12" height="12" fill="none" />
          <path d="M0 6h12M6 0v12" stroke={accent} strokeOpacity="0.28" strokeWidth="1" />
        </pattern>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.5" stopColor="#f2c14e" />
          <stop offset="1" stopColor="#8a5a12" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="98" height="138" rx="9" fill="#fbf7ee" />
      <rect x="5" y="5" width="90" height="130" rx="6" fill={`url(#${id}bg)`} />
      <rect x="5" y="5" width="90" height="130" rx="6" fill={`url(#${id}p)`} />
      <rect x="10" y="10" width="80" height="120" rx="4" fill="none" stroke={royal ? `url(#${id}g)` : accent} strokeWidth={royal ? 2.4 : 1.2} />
      {royal ? (
        <g>
          <circle cx="50" cy="70" r="24" fill="#2a0613" stroke={`url(#${id}g)`} strokeWidth="2.5" />
          <path d="M34 78 37 60l7 7 6-12 6 12 7-7 3 18z" fill={`url(#${id}g)`} stroke="#5a3a06" strokeWidth="0.8" />
          <rect x="34" y="78" width="32" height="5" rx="1.5" fill={`url(#${id}g)`} />
          {[44, 50, 56].map((x) => (
            <circle key={x} cx={x} cy="80.5" r="1.4" fill="#ff4fd8" />
          ))}
          {(
            [
              [18, 20],
              [82, 20],
              [18, 120],
              [82, 120],
            ] as const
          ).map(([x, y]) => (
            <path key={`${x}${y}`} d={`M${x} ${y - 5}l3 5-3 5-3-5z`} fill={`url(#${id}g)`} />
          ))}
        </g>
      ) : (
        <g>
          <path d="M50 46 70 70 50 94 30 70z" fill="none" stroke={accent} strokeWidth="2" />
          <path d="M50 56 62 70 50 84 38 70z" fill={accent} fillOpacity="0.85" />
        </g>
      )}
      {item?.style?.animated && (
        <rect x="5" y="5" width="90" height="130" rx="6" fill="none" stroke="#fff" strokeOpacity="0.25" strokeWidth="1">
          <animate attributeName="stroke-opacity" values="0.1;0.5;0.1" dur="2.4s" repeatCount="indefinite" />
        </rect>
      )}
    </svg>
  );
}

/** Built-in Vương Giả avatar: crowned sovereign crest on crimson and gold. */
export function VuongGiaAvatarArt() {
  const id = useId();
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" className="rounded-full" role="img" aria-label="Vương Giả">
      <defs>
        <radialGradient id={`${id}bg`} cx="40%" cy="30%" r="85%">
          <stop offset="0" stopColor="#b5132c" />
          <stop offset="0.6" stopColor="#5a0b1c" />
          <stop offset="1" stopColor="#1a030a" />
        </radialGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.45" stopColor="#f2c14e" />
          <stop offset="1" stopColor="#8a5a12" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="24" fill={`url(#${id}bg)`} />
      <g opacity="0.25" stroke="#ffe08a" strokeWidth="0.6">
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="24" y1="24" x2={24 + 22 * Math.cos((i * Math.PI) / 6)} y2={24 + 22 * Math.sin((i * Math.PI) / 6)} />
        ))}
      </g>
      <path d="M12 30 14 16l5 5 5-9 5 9 5-5 2 14z" fill={`url(#${id}g)`} stroke="#5a3a06" strokeWidth="0.7" />
      <rect x="12" y="30" width="24" height="4.5" rx="1.2" fill={`url(#${id}g)`} stroke="#5a3a06" strokeWidth="0.5" />
      <circle cx="24" cy="32.2" r="1.6" fill="#ff4fd8" />
      <circle cx="18" cy="32.2" r="1.1" fill="#5ad8ff" />
      <circle cx="30" cy="32.2" r="1.1" fill="#5ad8ff" />
      {[14, 24, 34].map((x, i) => (
        <circle key={x} cx={x} cy={i === 1 ? 11 : 15} r="1.5" fill="#fff1b8" />
      ))}
      <text x="24" y="42.5" textAnchor="middle" fontSize="5" fontWeight="800" fill="#ffe08a" letterSpacing="0.6">
        VƯƠNG GIẢ
      </text>
      <ellipse cx="24" cy="11" rx="16" ry="7" fill="#fff" fillOpacity="0.12" />
    </svg>
  );
}

/** Built-in Vương Giả frame: rotating gold–crimson ring with a crown on top and gem studs. */
export function VuongGiaFrame({ size }: { size: number }) {
  const id = useId();
  return (
    <svg viewBox="0 0 100 100" width={size * 1.32} height={size * 1.32} className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.35" stopColor="#f2c14e" />
          <stop offset="0.65" stopColor="#b5132c" />
          <stop offset="1" stopColor="#ffe08a" />
        </linearGradient>
      </defs>
      <g className="origin-center animate-spin-slow motion-reduce:animate-none" style={{ transformBox: 'fill-box' }}>
        <circle cx="50" cy="50" r="40.5" fill="none" stroke={`url(#${id}g)`} strokeWidth="5" />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return <circle key={i} cx={50 + 40.5 * Math.cos(a)} cy={50 + 40.5 * Math.sin(a)} r="2.6" fill={i % 2 ? '#ff4fd8' : '#5ad8ff'} stroke="#fff1b8" strokeWidth="0.8" />;
        })}
      </g>
      <circle cx="50" cy="50" r="37" fill="none" stroke="#2a0613" strokeWidth="1.2" />
      <path d="M36 14 38 2l6 5 6-7 6 7 6-5 2 12z" fill={`url(#${id}g)`} stroke="#5a3a06" strokeWidth="0.8" />
      <circle cx="50" cy="8" r="1.8" fill="#ff4fd8" />
    </svg>
  );
}

export const usesVuongGiaArt = isVuongGia;
