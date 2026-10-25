import { DIVISIONS, type RankTierId, type TopTitleId } from '@casino/shared';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

/** Palette per main rank: highlight, body, shadow, gem. */
const PALETTE: Record<RankTierId, [string, string, string, string]> = {
  bronze: ['#ffd2a8', '#c0773d', '#5a2e10', '#ff9d5c'],
  silver: ['#ffffff', '#b9c1d6', '#4f5873', '#dfe9ff'],
  gold: ['#fff1b8', '#f2c14e', '#8a5a12', '#ffe08a'],
  platinum: ['#d9fff6', '#5fd1bd', '#145b52', '#9ff7e6'],
  diamond: ['#e3f6ff', '#5aa8ff', '#1a3c8f', '#8fe0ff'],
  star: ['#f1e2ff', '#a874ff', '#3f1a85', '#e0c3ff'],
  master: ['#ffe0ec', '#ff6f9f', '#7d1238', '#ffb3cd'],
  legend: ['#fff0d6', '#ff9d3a', '#8a3108', '#ffd27a'],
  wargod: ['#ffe1e1', '#ff4a4a', '#5c0710', '#ffd27a'],
};
const TOP_PALETTE: Record<TopTitleId, [string, string, string, string]> = {
  than_vuong: ['#f3e6ff', '#c58bff', '#43177d', '#ffe08a'],
  than_tuong: ['#fff6cf', '#ffd24a', '#7a4a06', '#fff'],
  vuong_gia: ['#ffffff', '#ffe08a', '#b5132c', '#ff8ae8'],
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

/**
 * Rank badge: a shield in the tier's metal with the division numeral. Higher tiers gain wings,
 * then a crown; Top titles (Thần Vương / Thần Tướng / Vương Giả) get their own crowned crest.
 */
export function RankEmblem({ division, top = null, size = 48, dim = false }: { division: number; top?: TopTitleId | null; size?: number; dim?: boolean }) {
  const id = useId();
  const { t } = useTranslation();
  const d = DIVISIONS[Math.min(Math.max(0, division), DIVISIONS.length - 1)]!;
  const [hi, mid, lo, gem] = top ? TOP_PALETTE[top] : PALETTE[d.tier];
  const label = top ? t(`rank.top.${top}`) : `${t(`rank.tiers.${d.tier}`)} ${ROMAN[d.roman]}`;
  const wings = top || d.tierIndex >= 3;
  const crown = top || d.tierIndex >= 6;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={label} className={`shrink-0 ${dim ? 'opacity-35 grayscale' : ''}`}>
      <defs>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={hi} />
          <stop offset="0.5" stopColor={mid} />
          <stop offset="1" stopColor={lo} />
        </linearGradient>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d1740" />
          <stop offset="1" stopColor="#06050f" />
        </linearGradient>
        <radialGradient id={`${id}g`} cx="0.5" cy="0.45" r="0.5">
          <stop offset="0" stopColor={gem} stopOpacity="0.55" />
          <stop offset="1" stopColor={gem} stopOpacity="0" />
        </radialGradient>
      </defs>
      {(top || d.tierIndex >= 7) && <circle cx="32" cy="32" r="30" fill={`url(#${id}g)`} />}
      {wings && (
        <g fill={`url(#${id}m)`} opacity="0.95">
          <path d="M14 22 2 16c1 9 4 15 11 19z" />
          <path d="M50 22l12-6c-1 9-4 15-11 19z" />
          {d.tierIndex >= 5 && <path d="M13 32 4 30c2 6 5 9 10 11zM51 32l9-2c-2 6-5 9-10 11z" />}
        </g>
      )}
      <path d="M32 8 50 15v14c0 12-8 20-18 26C22 49 14 41 14 29V15z" fill={`url(#${id}m)`} />
      <path d="M32 12.5 46 18v11c0 9.4-6.2 15.8-14 20.6C24.2 44.8 18 38.4 18 29V18z" fill={`url(#${id}f)`} />
      {crown ? (
        <path d="M22 9l4 4 6-7 6 7 4-4-2 8H24z" fill={`url(#${id}m)`} stroke={lo} strokeWidth="0.6" />
      ) : (
        <path d="M32 5l2.6 4-2.6 2.2L29.4 9z" fill={gem} />
      )}
      {top ? (
        <>
          <path d="M32 22l3 6 6.5.9-4.7 4.6 1.1 6.5L32 37l-5.9 3 1.1-6.5-4.7-4.6 6.5-.9z" fill={gem} stroke={hi} strokeWidth="0.8" />
        </>
      ) : (
        <>
          <path d="M32 18.5l1.4 2.8 3.1.5-2.3 2.2.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.2 3.1-.5z" fill={gem} opacity={d.tierIndex >= 4 ? 1 : 0.55} />
          <text x="32" y="41" textAnchor="middle" fontSize={d.roman >= 4 ? 11 : 12.5} fontWeight="800" fontFamily="Playfair Display, Georgia, serif" fill={hi} letterSpacing="0.5">
            {ROMAN[d.roman]}
          </text>
        </>
      )}
      <path d="M21 17.5c3.4-1.8 7.1-2.9 11-2.9" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** "Bạch Kim IV" / "Vương Giả". */
export function useRankName() {
  const { t } = useTranslation();
  return (division: number, top?: TopTitleId | null) => {
    if (top) return t(`rank.top.${top}`);
    const d = DIVISIONS[division]!;
    return `${t(`rank.tiers.${d.tier}`)} ${ROMAN[d.roman]}`;
  };
}
