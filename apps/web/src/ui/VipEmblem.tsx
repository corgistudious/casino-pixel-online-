import { useId } from 'react';

/** Tier palettes: bronze → silver → gold → emerald → sapphire → royal (VIP 15). */
const TIERS: { from: number; colors: [string, string, string]; gem: string }[] = [
  { from: 1, colors: ['#ffd2a8', '#c8763a', '#6b3412'], gem: '#ff9d5c' },
  { from: 4, colors: ['#ffffff', '#b9c1d6', '#5b6684'], gem: '#dfe9ff' },
  { from: 7, colors: ['#fff1b8', '#f2c14e', '#8a5a12'], gem: '#ffe08a' },
  { from: 10, colors: ['#c9ffe2', '#1fae5e', '#0b4128'], gem: '#7ff0a8' },
  { from: 13, colors: ['#d6f4ff', '#3d7bff', '#162f87'], gem: '#5ad8ff' },
  { from: 15, colors: ['#ffe6ff', '#b45cff', '#4e1a85'], gem: '#ff8ae8' },
];

export function vipTier(level: number) {
  return [...TIERS].reverse().find((t) => level >= t.from)!;
}

/** Shield emblem with the VIP level number. */
export function VipEmblem({ level, size = 40, dim = false }: { level: number; size?: number; dim?: boolean }) {
  const id = useId();
  const tier = vipTier(level);
  const [hi, mid, lo] = tier.colors;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={`VIP ${level}`} className={`shrink-0 ${dim ? 'opacity-35 grayscale' : ''}`}>
      <defs>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={hi} />
          <stop offset="0.5" stopColor={mid} />
          <stop offset="1" stopColor={lo} />
        </linearGradient>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b1636" />
          <stop offset="1" stopColor="#05040b" />
        </linearGradient>
      </defs>
      {level >= 10 && <path d="M8 14 3 9l1 9M40 14l5-5-1 9" stroke={`url(#${id}m)`} strokeWidth="2" strokeLinecap="round" fill="none" />}
      <path d="M24 3 41 9v13c0 11-7.5 18-17 23C14.5 40 7 33 7 22V9z" fill={`url(#${id}m)`} />
      <path d="M24 7 37.5 12v10c0 8.8-5.8 14.6-13.5 18.8C16.3 36.6 10.5 30.8 10.5 22V12z" fill={`url(#${id}f)`} />
      <path d="M24 2.5l2 3.2-2 1.6-2-1.6z" fill={tier.gem} />
      <text x="24" y="19.5" textAnchor="middle" fontSize="7.5" fontWeight="800" letterSpacing="1" fill={mid}>
        VIP
      </text>
      <text x="24" y="33" textAnchor="middle" fontSize={level >= 10 ? 14 : 16} fontWeight="800" fontFamily="Playfair Display, Georgia, serif" fill={hi}>
        {level}
      </text>
      <path d="M14 12.5c3-1.6 6.4-2.6 10-2.6" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
