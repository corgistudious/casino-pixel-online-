import { DEFAULT_FRAME, findFrame, type CatalogItem } from '@casino/shared';
import { useId } from 'react';
import { assetSrc, useCatalog } from '../store/catalog';
import { usesVuongGiaArt, VuongGiaAvatarArt, VuongGiaFrame } from './Cosmetics';

/** 16 vector emblems: gradient pairs and glyph paths (24×24 viewBox). */
const PALETTES: [string, string][] = [
  ['#ff6b7a', '#7d0618'],
  ['#5ad8ff', '#16408a'],
  ['#7ff0a8', '#0b5e31'],
  ['#d6a6ff', '#4e1a85'],
  ['#ffe08a', '#8a5a12'],
  ['#ff9f5a', '#8a2f0a'],
  ['#9dbbff', '#24305e'],
  ['#ff8ad8', '#7a1460'],
];

const GLYPHS = [
  'M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6L12 16.3 6.6 19.3l1.3-6L3.3 9.2l6.1-.6z', // star
  'M4 17l2-9 4 4 2-7 2 7 4-4 2 9z', // crown
  'M12 3l7 6-7 12-7-12z', // gem
  'M12 4c3 4 7 6 7 10a4 4 0 0 1-7 2.5 4 4 0 0 1-7-2.5c0-4 4-6 7-10z', // spade-ish
  'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z', // heart
  'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10z', // chip ring
  'M5 5h14v14H5z M9 9h2v2H9z M13 13h2v2h-2z', // die
  'M12 3l3 6h6l-5 4 2 7-6-4-6 4 2-7-5-4h6z', // badge
];

export function avatarCount() {
  return PALETTES.length * 2;
}

/**
 * Round avatar with its frame. `frame` is a catalog frame id or 'none'; `avatarItem` is an owned
 * special avatar (catalog image) shown instead of the default emblem `index`.
 */
export function Avatar({
  index,
  size = 48,
  frame = DEFAULT_FRAME,
  animated = false,
  avatarItem = null,
}: {
  index: number;
  size?: number;
  frame?: string;
  animated?: boolean;
  avatarItem?: string | null;
}) {
  const items = useCatalog((c) => c.items);
  const special = avatarItem ? items[avatarItem] : undefined;
  return (
    <FramedAvatar
      index={index}
      size={size}
      frame={frame}
      frameItem={items[frame]}
      avatarSrc={assetSrc(special?.assetUrl)}
      avatarArt={!special?.assetUrl && usesVuongGiaArt(special) ? 'vuong_gia' : undefined}
      animated={animated}
    />
  );
}

/**
 * Rendering core, fed explicit data (the admin editor previews unreleased items with it).
 * Uploaded frames are drawn around the circle with their render settings (scale/offset), centred
 * on the avatar so they never cover the face or distort; built-in frames are gradient rings.
 */
export function FramedAvatar({
  index,
  size,
  frame,
  frameItem,
  avatarSrc,
  avatarArt,
  animated = false,
}: {
  index: number;
  size: number;
  frame: string;
  frameItem?: Pick<CatalogItem, 'assetUrl' | 'render'> & Partial<Pick<CatalogItem, 'style'>>;
  avatarSrc?: string;
  /** Built-in artwork avatar (e.g. the Vương Giả set) instead of an uploaded image. */
  avatarArt?: 'vuong_gia';
  animated?: boolean;
}) {
  const id = useId();
  const palette = PALETTES[index % PALETTES.length]!;
  const glyph = GLYPHS[(index + Math.floor(index / PALETTES.length) * 3) % GLYPHS.length]!;
  const inner = avatarArt === 'vuong_gia' ? (
    <VuongGiaAvatarArt />
  ) : avatarSrc ? (
    <img src={avatarSrc} alt="" draggable={false} className="h-full w-full rounded-full object-cover" />
  ) : (
    <svg viewBox="0 0 48 48" width="100%" height="100%" className="rounded-full">
      <defs>
        <radialGradient id={`${id}bg`} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor={palette[0]} />
          <stop offset="1" stopColor={palette[1]} />
        </radialGradient>
        <linearGradient id={`${id}gl`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="24" fill={`url(#${id}bg)`} />
      <g transform="translate(12 12)" fill="#fff" fillOpacity="0.92" fillRule="evenodd">
        <path d={glyph} />
      </g>
      <ellipse cx="24" cy="12" rx="17" ry="9" fill={`url(#${id}gl)`} />
    </svg>
  );
  if (frame === 'none') return <div className="shrink-0" style={{ width: size, height: size }}>{inner}</div>;
  if (!frameItem?.assetUrl && frameItem?.style?.art === 'vuong_gia') {
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <div className="absolute inset-[2px] overflow-hidden rounded-full ring-2 ring-[#2a0613]">{inner}</div>
        <VuongGiaFrame size={size} />
      </div>
    );
  }
  if (frameItem?.assetUrl) {
    const r = frameItem.render ?? { scale: 1.25, offsetX: 0, offsetY: 0 };
    const w = size * r.scale;
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <div className="absolute inset-0 overflow-hidden rounded-full">{inner}</div>
        <img
          src={assetSrc(frameItem.assetUrl)}
          alt=""
          draggable={false}
          className="pointer-events-none absolute max-w-none select-none object-contain"
          style={{ width: w, height: w, left: (size - w) / 2 + r.offsetX * size, top: (size - w) / 2 + r.offsetY * size }}
        />
      </div>
    );
  }
  return (
    <div className="relative shrink-0 rounded-full" style={{ width: size, height: size }}>
      <FrameRing frame={frame} animated={animated} />
      <div className="absolute inset-[2px] rounded-full bg-ink-900" />
      <div className="absolute inset-[3px] overflow-hidden rounded-full">{inner}</div>
    </div>
  );
}

/** Built-in gradient ring: catalog style when loaded, otherwise the shared defaults. */
export function FrameRing({ frame, animated = false }: { frame: string; animated?: boolean }) {
  const fromCatalog = useCatalog((c) => c.items[frame]?.style);
  const fallback = findFrame(frame) ?? findFrame(DEFAULT_FRAME)!;
  const style = fromCatalog ?? { colors: fallback.colors, animated: fallback.animated };
  const stops = [...style.colors, style.colors[0]].join(', ');
  return (
    <div
      className={`absolute inset-0 rounded-full ${style.animated || animated ? 'animate-spin-slow' : ''} ${style.animated ? 'shadow-glow' : ''}`}
      style={{ background: `conic-gradient(from 0deg, ${stops})` }}
    />
  );
}

const MEDALS: Record<1 | 2 | 3, [string, string, string]> = {
  1: ['#fff1b8', '#f2c14e', '#8a5a12'],
  2: ['#ffffff', '#c9cbd8', '#6b6e82'],
  3: ['#ffd2a8', '#c8763a', '#6b3412'],
};

export function Medal({ rank, size = 28 }: { rank: number; size?: number }) {
  const id = useId();
  if (rank < 1 || rank > 3) {
    return <span className="inline-flex w-7 justify-center font-display text-sm text-white/60">{rank}</span>;
  }
  const [a, b, c] = MEDALS[rank as 1 | 2 | 3];
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-label={`#${rank}`}>
      <defs>
        <radialGradient id={id} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor={a} />
          <stop offset="0.55" stopColor={b} />
          <stop offset="1" stopColor={c} />
        </radialGradient>
      </defs>
      <path d="M8 1h4l2 7-4 1zM20 1h-4l-2 7 4 1z" fill="#d42a44" />
      <circle cx="14" cy="17" r="9.5" fill={`url(#${id})`} stroke={c} strokeWidth="0.8" />
      <circle cx="14" cy="17" r="6.5" fill="none" stroke={c} strokeOpacity="0.5" strokeWidth="0.8" />
      <text x="14" y="17.5" textAnchor="middle" dominantBaseline="middle" fontWeight="800" fontSize="9" fill={c}>
        {rank}
      </text>
    </svg>
  );
}
