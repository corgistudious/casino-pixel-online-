import { useId } from 'react';
/** Every game shown in the hub, including tables that are still in development. */
export type HubGameKey = 'poker' | 'sicbo' | 'roulette' | 'lieng' | 'xito' | 'blackjack' | 'slots';

const SUIT_PATHS: Record<'S' | 'H' | 'D' | 'C', string> = {
  H: 'M0 9C-9-1-5-9 0-3c5-6 9 2 0 12z',
  D: 'M0-10 7 0 0 10-7 0z',
  S: 'M0-10C9-1 5 7 0 2c-5 5-9-3 0-12zM0 1l3 9h-6z',
  C: 'M0-9a4 4 0 1 1 0 .1zM-5-1a4 4 0 1 1 0 .1zM5-1a4 4 0 1 1 0 .1zM0-2l3 11h-6z',
};

/** Stand-alone roulette wheel (transparent background) for hero banners. */
export function WheelArt() {
  const id = useId();
  const p = (r: number, a: number) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
  return (
    <svg viewBox="-60 -60 120 120" className="h-full w-full">
      <defs>
        <Gold id={`${id}g`} />
        <radialGradient id={`${id}w`} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#8a4f22" />
          <stop offset="1" stopColor="#2a1306" />
        </radialGradient>
        <filter id={`${id}s`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.55" />
        </filter>
      </defs>
      <g filter={`url(#${id}s)`}>
        <circle r="56" fill={`url(#${id}w)`} stroke={`url(#${id}g)`} strokeWidth="2.5" />
        {Array.from({ length: 37 }, (_, i) => {
          const a0 = ((i - 0.5) / 37) * Math.PI * 2 - Math.PI / 2;
          const a1 = ((i + 0.5) / 37) * Math.PI * 2 - Math.PI / 2;
          const fill = i === 0 ? '#1f9d61' : i % 2 ? '#c8102e' : '#15131f';
          return <path key={i} d={`M${p(48, a0)} A48 48 0 0 1 ${p(48, a1)} L${p(32, a1)} A32 32 0 0 0 ${p(32, a0)}Z`} fill={fill} stroke="#e8b64a" strokeWidth="0.35" />;
        })}
        <circle r="32" fill="#6a3a16" stroke={`url(#${id}g)`} strokeWidth="1.5" />
        <circle r="8" fill={`url(#${id}g)`} />
        {[0, 90, 180, 270].map((a) => (
          <rect key={a} x="-1.6" y="-28" width="3.2" height="21" rx="1.6" fill={`url(#${id}g)`} transform={`rotate(${a + 45})`} />
        ))}
        <circle cx="25" cy="-34" r="3.6" fill="#fff" />
      </g>
    </svg>
  );
}

/** A playing card centred on (0,0), 40×56. */
function MiniCard({ rank, suit, grad, back = false }: { rank: string; suit: 'S' | 'H' | 'D' | 'C'; grad: string; back?: boolean }) {
  const red = suit === 'H' || suit === 'D';
  const ink = red ? '#c8103a' : '#16142b';
  if (back) {
    return (
      <g>
        <rect x="-20" y="-28" width="40" height="56" rx="4.5" fill="#6e1530" stroke="#f2c14e" strokeWidth="1.2" />
        <rect x="-15" y="-23" width="30" height="46" rx="2.5" fill="none" stroke="#f7d77a" strokeOpacity="0.7" strokeWidth="0.8" />
        <path d="M0-8 6 0 0 8-6 0z" fill="#f2c14e" />
      </g>
    );
  }
  return (
    <g>
      <rect x="-20" y="-28" width="40" height="56" rx="4.5" fill={grad} stroke="#c9bfa8" strokeWidth="0.8" />
      <text x="-14" y="-14" fontFamily="Playfair Display, serif" fontWeight="700" fontSize="12" fill={ink}>
        {rank}
      </text>
      <path d={SUIT_PATHS[suit]} transform="translate(2 6) scale(1.05)" fill={ink} />
    </g>
  );
}

function Gold({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#fff1b8" />
      <stop offset="0.4" stopColor="#f2c14e" />
      <stop offset="0.65" stopColor="#b9801c" />
      <stop offset="1" stopColor="#f7d77a" />
    </linearGradient>
  );
}

/** Lobby key art for each game — original vector illustrations. */
export function GameArt({ game }: { game: HubGameKey }) {
  const id = useId();
  const gold = `${id}gold`;
  const common = (
    <defs>
      <Gold id={gold} />
      <radialGradient id={`${id}felt`} cx="50%" cy="35%" r="80%">
        <stop offset="0" stopColor="#1f8a5a" />
        <stop offset="1" stopColor="#062a1b" />
      </radialGradient>
      <radialGradient id={`${id}night`} cx="50%" cy="20%" r="90%">
        <stop offset="0" stopColor="#3a2a7a" />
        <stop offset="1" stopColor="#0a0818" />
      </radialGradient>
      <radialGradient id={`${id}red`} cx="35%" cy="30%" r="70%">
        <stop offset="0" stopColor="#ff6b7a" />
        <stop offset="1" stopColor="#7d0618" />
      </radialGradient>
      <linearGradient id={`${id}card`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#e9e2d2" />
      </linearGradient>
      <filter id={`${id}sh`} x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.5" />
      </filter>
    </defs>
  );

  switch (game) {
    case 'poker':
      return (
        <svg viewBox="0 0 200 120" className="h-full w-full">
          {common}
          <rect width="200" height="120" fill={`url(#${id}felt)`} />
          <ellipse cx="100" cy="128" rx="120" ry="58" fill="none" stroke={`url(#${gold})`} strokeWidth="1.4" opacity="0.7" />
          {(
            [
              ['A', 'S'],
              ['K', 'H'],
              ['Q', 'D'],
              ['J', 'C'],
              ['10', 'S'],
            ] as const
          ).map(([rank, suit], i) => (
            <g key={rank} transform={`translate(${44 + i * 28} ${52 + Math.abs(i - 2) * 4}) rotate(${(i - 2) * 7})`} filter={`url(#${id}sh)`}>
              <MiniCard rank={rank} suit={suit} grad={`url(#${id}card)`} />
            </g>
          ))}
          {[0, 1, 2, 3].map((i) => (
            <ellipse key={i} cx="170" cy={102 - i * 4} rx="13" ry="5" fill={i % 2 ? '#24203f' : '#d42a44'} stroke="#f2c14e" strokeWidth="1" />
          ))}
        </svg>
      );
    case 'lieng':
      return (
        <svg viewBox="0 0 200 120" className="h-full w-full">
          {common}
          <rect width="200" height="120" fill={`url(#${id}night)`} />
          <circle cx="100" cy="60" r="46" fill="none" stroke={`url(#${gold})`} strokeWidth="1" opacity="0.5" />
          {(
            [
              ['3', 'H'],
              ['3', 'D'],
              ['3', 'S'],
            ] as const
          ).map(([rank, suit], i) => (
            <g key={suit} transform={`translate(${78 + i * 22} 62) rotate(${(i - 1) * 16})`} filter={`url(#${id}sh)`}>
              <MiniCard rank={rank} suit={suit} grad={`url(#${id}card)`} />
            </g>
          ))}
          {[
            [36, 92],
            [48, 98],
            [158, 94],
          ].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="9" fill={`url(#${gold})`} stroke="#8a5a12" strokeWidth="0.8" />
              <circle cx={x} cy={y} r="5.5" fill="none" stroke="#8a5a12" strokeOpacity="0.6" />
            </g>
          ))}
        </svg>
      );
    case 'xito':
      return (
        <svg viewBox="0 0 200 120" className="h-full w-full">
          {common}
          <rect width="200" height="120" fill={`url(#${id}felt)`} />
          <path d="M10 106 Q100 70 190 106" fill="none" stroke={`url(#${gold})`} strokeWidth="1.2" opacity="0.7" />
          {(
            [
              ['K', 'S', true],
              ['K', 'H', true],
              ['K', 'D', false],
              ['7', 'C', false],
              ['7', 'H', false],
            ] as const
          ).map(([rank, suit, back], i) => (
            <g key={i} transform={`translate(${40 + i * 30} ${56 - (i === 2 ? 4 : 0)})`} filter={`url(#${id}sh)`}>
              <MiniCard rank={rank} suit={suit} grad={`url(#${id}card)`} back={back} />
            </g>
          ))}
        </svg>
      );
    case 'slots':
      return (
        <svg viewBox="0 0 200 120" className="h-full w-full">
          {common}
          <rect width="200" height="120" fill={`url(#${id}night)`} />
          <g filter={`url(#${id}sh)`}>
            <rect x="34" y="22" width="132" height="76" rx="12" fill="#1b1340" stroke={`url(#${gold})`} strokeWidth="3" />
            {[0, 1, 2].map((i) => (
              <rect key={i} x={46 + i * 38} y="34" width="32" height="52" rx="5" fill="#f6f2ff" />
            ))}
          </g>
          {[0, 1, 2].map((i) => (
            <text key={i} x={62 + i * 38} y="70" textAnchor="middle" fontFamily="Playfair Display, serif" fontWeight="900" fontSize="30" fill={`url(#${id}red)`} stroke={`url(#${gold})`} strokeWidth="1">
              7
            </text>
          ))}
          {Array.from({ length: 12 }, (_, i) => (
            <circle key={i} cx={40 + i * 11} cy="16" r="2" fill="#ffe08a" opacity={i % 2 ? 1 : 0.5} />
          ))}
        </svg>
      );
    case 'roulette':
      return (
        <svg viewBox="0 0 200 120" className="h-full w-full">
          {common}
          <rect width="200" height="120" fill={`url(#${id}felt)`} />
          <g filter={`url(#${id}sh)`} transform="translate(100 60)">
            <circle r="50" fill="#3a1d0b" stroke={`url(#${gold})`} strokeWidth="2.5" />
            {Array.from({ length: 37 }, (_, i) => {
              const a0 = ((i - 0.5) / 37) * Math.PI * 2 - Math.PI / 2;
              const a1 = ((i + 0.5) / 37) * Math.PI * 2 - Math.PI / 2;
              const p = (r: number, a: number) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
              const fill = i === 0 ? '#1f9d61' : i % 2 ? '#c8102e' : '#15131f';
              return <path key={i} d={`M${p(42, a0)} A42 42 0 0 1 ${p(42, a1)} L${p(28, a1)} A28 28 0 0 0 ${p(28, a0)}Z`} fill={fill} />;
            })}
            <circle r="28" fill="#6a3a16" stroke={`url(#${gold})`} strokeWidth="1.5" />
            <circle r="7" fill={`url(#${gold})`} />
            {[0, 90, 180, 270].map((a) => (
              <rect key={a} x="-1.5" y="-24" width="3" height="18" rx="1.5" fill={`url(#${gold})`} transform={`rotate(${a + 45})`} />
            ))}
            <circle cx="22" cy="-30" r="3.5" fill="#fff" />
          </g>
        </svg>
      );
    case 'sicbo':
      return (
        <svg viewBox="0 0 200 120" className="h-full w-full">
          {common}
          <rect width="200" height="120" fill={`url(#${id}felt)`} />
          <ellipse cx="100" cy="66" rx="70" ry="40" fill="#f2c14e" />
          <ellipse cx="100" cy="64" rx="64" ry="35" fill="#fbf7ee" />
          {[
            [70, 60, -12, 4],
            [100, 48, 8, 1],
            [128, 64, 18, 6],
          ].map(([x, y, r, face]) => (
            <g key={x} transform={`translate(${x} ${y}) rotate(${r})`} filter={`url(#${id}sh)`}>
              <rect x="-14" y="-14" width="28" height="28" rx="6" fill={`url(#${id}card)`} stroke="#c9c1da" strokeWidth="0.8" />
              {(
                {
                  1: [[0, 0]],
                  4: [[-6, -6], [6, -6], [-6, 6], [6, 6]],
                  6: [[-6, -7], [6, -7], [-6, 0], [6, 0], [-6, 7], [6, 7]],
                } as Record<number, number[][]>
              )[face!]!.map(([dx, dy], i) => (
                <circle key={i} cx={dx} cy={dy} r={face === 1 ? 5 : 2.6} fill={face === 1 || face === 4 ? '#c8102e' : '#1d1a3a'} />
              ))}
            </g>
          ))}
        </svg>
      );
    case 'blackjack':
      return (
        <svg viewBox="0 0 200 120" className="h-full w-full">
          {common}
          <rect width="200" height="120" fill={`url(#${id}felt)`} />
          <path d="M10 10 Q100 70 190 10" fill="none" stroke={`url(#${gold})`} strokeWidth="1.2" opacity="0.7" />
          {[
            { x: 66, r: -12, rank: 'A', suit: '♠', color: '#16142b' },
            { x: 106, r: 10, rank: 'K', suit: '♥', color: '#c8102e' },
          ].map((c) => (
            <g key={c.rank} transform={`translate(${c.x} 62) rotate(${c.r})`} filter={`url(#${id}sh)`}>
              <rect x="-24" y="-34" width="48" height="68" rx="5" fill={`url(#${id}card)`} stroke="#c9bfa8" strokeWidth="0.8" />
              <text x="-16" y="-18" fontFamily="Playfair Display, serif" fontWeight="700" fontSize="14" fill={c.color}>
                {c.rank}
              </text>
              <text x="0" y="12" textAnchor="middle" fontSize="28" fill={c.color}>
                {c.suit}
              </text>
            </g>
          ))}
          <circle cx="160" cy="90" r="14" fill="#24203f" stroke="#f2c14e" strokeWidth="2" strokeDasharray="5 3" />
          <circle cx="160" cy="86" r="14" fill="#d42a44" stroke="#fff" strokeWidth="2" strokeDasharray="5 3" />
        </svg>
      );
  }
}
