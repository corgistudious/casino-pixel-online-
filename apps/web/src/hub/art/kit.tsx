/**
 * Vector illustration kit for the Game Hub key art. Everything is drawn with SVG
 * primitives (original artwork, no third-party assets) and rendered crisp at any size.
 */
import type { ReactNode } from 'react';

export type Suit = 'S' | 'H' | 'D' | 'C';

/** Suit outlines centred on (0,0), roughly 20 units tall. */
export const SUIT_PATH: Record<Suit, string> = {
  H: 'M0 9C-9-1-5-9 0-3c5-6 9 2 0 12z',
  D: 'M0-10C2.5-6 5-3 7 0 5 3 2.5 6 0 10-2.5 6-5 3-7 0-5-3-2.5-6 0-10z',
  S: 'M0-10C9-1 6 7 0 2c-6 5-9-3 0-12zM0 1l3.2 9h-6.4z',
  C: 'M0-9.5a4.3 4.3 0 1 1 0 .1zM-5.2-1.2a4.3 4.3 0 1 1 0 .1zM5.2-1.2a4.3 4.3 0 1 1 0 .1zM0-3l3.2 12h-6.4z',
};

const RED = '#c4102f';
const INK = '#17142d';

/** Shared gradients and filters. `p` prefixes every id so several illustrations can share a page. */
export function KitDefs({ p }: { p: string }) {
  return (
    <defs>
      <linearGradient id={`${p}gold`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff4c8" />
        <stop offset="0.3" stopColor="#f2c14e" />
        <stop offset="0.6" stopColor="#a8700f" />
        <stop offset="1" stopColor="#f7d77a" />
      </linearGradient>
      <linearGradient id={`${p}goldV`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff4c8" />
        <stop offset="0.45" stopColor="#f2c14e" />
        <stop offset="1" stopColor="#8a5a12" />
      </linearGradient>
      <linearGradient id={`${p}card`} x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#ebe4d4" />
      </linearGradient>
      <linearGradient id={`${p}back`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#8c1c3d" />
        <stop offset="1" stopColor="#3f0717" />
      </linearGradient>
      <radialGradient id={`${p}felt`} cx="50%" cy="30%" r="80%">
        <stop offset="0" stopColor="#23a066" />
        <stop offset="0.55" stopColor="#0f6a41" />
        <stop offset="1" stopColor="#053421" />
      </radialGradient>
      <linearGradient id={`${p}wood`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#7a4420" />
        <stop offset="0.5" stopColor="#4a250e" />
        <stop offset="1" stopColor="#2a1306" />
      </linearGradient>
      <linearGradient id={`${p}leather`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3b2a52" />
        <stop offset="1" stopColor="#140d24" />
      </linearGradient>
      <linearGradient id={`${p}beam`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff2c4" stopOpacity="0.38" />
        <stop offset="1" stopColor="#fff2c4" stopOpacity="0" />
      </linearGradient>
      <radialGradient id={`${p}glow`} cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#ffe9a8" stopOpacity="0.55" />
        <stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
      </radialGradient>
      <filter id={`${p}shadow`} x="-30%" y="-30%" width="160%" height="170%">
        <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#000" floodOpacity="0.5" />
      </filter>
      <filter id={`${p}soft`} x="-10%" y="-10%" width="120%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="#000" floodOpacity="0.45" />
      </filter>
      <filter id={`${p}blur`}>
        <feGaussianBlur stdDeviation="6" />
      </filter>
    </defs>
  );
}

/** Playing card, 60×84 units, centred on (0,0). Place it with a transform. */
export function PlayingCard({ p, rank, suit, back = false }: { p: string; rank?: string; suit?: Suit; back?: boolean }) {
  if (back || !rank || !suit) {
    return (
      <g>
        <rect x="-30" y="-42" width="60" height="84" rx="6" fill={`url(#${p}back)`} stroke={`url(#${p}gold)`} strokeWidth="1.6" />
        <rect x="-24" y="-36" width="48" height="72" rx="3.5" fill="none" stroke="#f7d77a" strokeOpacity="0.55" strokeWidth="1" />
        <g opacity="0.35" stroke="#f7d77a" strokeWidth="0.7">
          {Array.from({ length: 9 }, (_, i) => (
            <path key={i} d={`M${-24 + i * 6} -36 L${24} ${-36 + (48 - i * 6) * 1.5}`} />
          ))}
        </g>
        <path d="M0-12 9 0 0 12-9 0z" fill={`url(#${p}gold)`} />
        <path d="M0-12 9 0 0 2z" fill="#fff4c8" opacity="0.5" />
      </g>
    );
  }
  const ink = suit === 'H' || suit === 'D' ? RED : INK;
  const face = rank === 'J' || rank === 'Q' || rank === 'K';
  return (
    <g>
      <rect x="-30" y="-42" width="60" height="84" rx="6" fill={`url(#${p}card)`} stroke="#c9bea6" strokeWidth="0.9" />
      <text x="-23" y="-23" fontFamily="'Playfair Display', Georgia, serif" fontWeight="700" fontSize={rank === '10' ? 15 : 17} fill={ink}>
        {rank}
      </text>
      <path d={SUIT_PATH[suit]} transform="translate(-18 -10) scale(0.5)" fill={ink} />
      <g transform="rotate(180)">
        <text x="-23" y="-23" fontFamily="'Playfair Display', Georgia, serif" fontWeight="700" fontSize={rank === '10' ? 15 : 17} fill={ink}>
          {rank}
        </text>
        <path d={SUIT_PATH[suit]} transform="translate(-18 -10) scale(0.5)" fill={ink} />
      </g>
      {face ? (
        <g>
          <rect x="-15" y="-27" width="30" height="54" rx="2.5" fill={suit === 'H' || suit === 'D' ? '#fbe9e4' : '#e9ebfa'} stroke={`url(#${p}gold)`} strokeWidth="1.2" />
          <text x="0" y="6" textAnchor="middle" fontFamily="'Playfair Display', Georgia, serif" fontWeight="900" fontSize="26" fill={ink}>
            {rank}
          </text>
          <path d={SUIT_PATH[suit]} transform="translate(0 18) scale(0.5)" fill={ink} />
        </g>
      ) : (
        <path d={SUIT_PATH[suit]} transform={`translate(0 3) scale(${rank === 'A' ? 1.5 : 1.15})`} fill={ink} />
      )}
    </g>
  );
}

const CHIP_COLORS: Record<string, [string, string]> = {
  red: ['#e0354f', '#7d1222'],
  blue: ['#3d6dff', '#162f87'],
  black: ['#3a3452', '#0d0b17'],
  green: ['#25b46d', '#0b5434'],
  purple: ['#a65cf0', '#4e1a85'],
  gold: ['#f6cc5c', '#8a5a12'],
};

/** Stack of casino chips seen at ~30° from above; (x,y) is the centre of the bottom chip. */
export function ChipStack({ x, y, count, color = 'red', r = 20 }: { x: number; y: number; count: number; color?: keyof typeof CHIP_COLORS; r?: number }) {
  const [base, dark] = CHIP_COLORS[color]!;
  const ry = r * 0.42;
  const h = r * 0.24;
  return (
    <g>
      <ellipse cx={x} cy={y + h + 2} rx={r * 1.15} ry={ry * 1.3} fill="#000" opacity="0.35" />
      {Array.from({ length: count }, (_, i) => {
        const cy = y - i * h;
        return (
          <g key={i}>
            <path d={`M${x - r} ${cy} v${h} a${r} ${ry} 0 0 0 ${2 * r} 0 v${-h} z`} fill={dark} />
            <path d={`M${x - r} ${cy} v${h} a${r} ${ry} 0 0 0 ${2 * r} 0 v${-h} z`} fill="none" stroke="#fff" strokeOpacity="0.75" strokeWidth={h * 0.9} strokeDasharray={`${r * 0.32} ${r * 0.42}`} />
            <ellipse cx={x} cy={cy} rx={r} ry={ry} fill={base} />
            <ellipse cx={x} cy={cy} rx={r * 0.8} ry={ry * 0.8} fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth={r * 0.1} strokeDasharray={`${r * 0.22} ${r * 0.3}`} />
            <ellipse cx={x} cy={cy} rx={r * 0.52} ry={ry * 0.52} fill={dark} opacity="0.45" />
            <ellipse cx={x - r * 0.25} cy={cy - ry * 0.35} rx={r * 0.45} ry={ry * 0.25} fill="#fff" opacity="0.18" />
          </g>
        );
      })}
    </g>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.27, 0.22], [0.73, 0.22], [0.27, 0.5], [0.73, 0.5], [0.27, 0.78], [0.73, 0.78]],
};

type Pt = [number, number];

/** Pips projected onto a face given its corners A (u0,v0), B (u1,v0), D (u0,v1). */
function FacePips({ a, b, d, face }: { a: Pt; b: Pt; d: Pt; face: number }) {
  const m = `matrix(${b[0] - a[0]} ${b[1] - a[1]} ${d[0] - a[0]} ${d[1] - a[1]} ${a[0]} ${a[1]})`;
  const red = face === 1 || face === 4;
  return (
    <g transform={m}>
      {PIPS[face]!.map(([u, v], i) => (
        <circle key={i} cx={u} cy={v} r={face === 1 ? 0.15 : 0.095} fill={red ? '#c4102f' : '#1a1630'} />
      ))}
    </g>
  );
}

/** Isometric die with edge `a`; (x,y) is the front vertical edge's top point. */
export function Die3D({ x, y, a, top, left, right, rot = 0 }: { x: number; y: number; a: number; top: number; left: number; right: number; rot?: number }) {
  const c = 0.866 * a;
  // Top face is a rhombus above the front vertical edge (top2 → bottom).
  const top0: Pt = [x, y - a];
  const top1: Pt = [x + c, y - a / 2];
  const top2: Pt = [x, y];
  const top3: Pt = [x - c, y - a / 2];
  const bottom: Pt = [x, y + a];
  const leftB: Pt = [x - c, y + a / 2];
  const rightB: Pt = [x + c, y + a / 2];
  const poly = (pts: Pt[]) => pts.map((q) => q.join(',')).join(' ');
  return (
    <g transform={`rotate(${rot} ${x} ${y})`}>
      <ellipse cx={x} cy={y + a * 1.05} rx={c * 1.2} ry={a * 0.28} fill="#000" opacity="0.35" />
      <polygon points={poly([top3, top2, bottom, leftB])} fill="#e3dced" stroke="#a79cbd" strokeWidth="0.6" strokeLinejoin="round" />
      <polygon points={poly([top2, top1, rightB, bottom])} fill="#c9bfd9" stroke="#a79cbd" strokeWidth="0.6" strokeLinejoin="round" />
      <polygon points={poly([top0, top1, top2, top3])} fill="#ffffff" stroke="#cfc6de" strokeWidth="0.6" strokeLinejoin="round" />
      <FacePips a={top3} b={top0} d={top2} face={top} />
      <FacePips a={top3} b={top2} d={leftB} face={left} />
      <FacePips a={top2} b={top1} d={bottom} face={right} />
      <polygon points={poly([top3, top0, [x - c * 0.2, y - a * 0.62]])} fill="#fff" opacity="0.5" />
    </g>
  );
}

/** Official Cxu coin artwork (PNG), centred on (x,y). */
export function Coin({ x, y, size, kind = 'gold', rot = 0 }: { x: number; y: number; size: number; kind?: 'gold' | 'silver'; rot?: number }) {
  return (
    <image
      href={kind === 'gold' ? 'assets/official/cxu-vang.png' : 'assets/official/cxu-bac.png'}
      x={x - size / 2}
      y={y - size / 2}
      width={size}
      height={size}
      transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}

/** Soft top-down light cone. */
export function Beam({ p, x, w, h }: { p: string; x: number; w: number; h: number }) {
  return <path d={`M${x - w * 0.18} 0 L${x + w * 0.18} 0 L${x + w / 2} ${h} L${x - w / 2} ${h} Z`} fill={`url(#${p}beam)`} />;
}

/** Tiny four-point sparkle. */
export function Sparkle({ x, y, s = 6, o = 0.9 }: { x: number; y: number; s?: number; o?: number }) {
  return (
    <path
      d={`M${x} ${y - s} Q${x + s * 0.12} ${y - s * 0.12} ${x + s} ${y} Q${x + s * 0.12} ${y + s * 0.12} ${x} ${y + s} Q${x - s * 0.12} ${y + s * 0.12} ${x - s} ${y} Q${x - s * 0.12} ${y - s * 0.12} ${x} ${y - s}Z`}
      fill="#fff6d8"
      opacity={o}
    />
  );
}

export function Art({ children, viewBox = '0 0 400 300' }: { children: ReactNode; viewBox?: string }) {
  return (
    <svg viewBox={viewBox} className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {children}
    </svg>
  );
}
