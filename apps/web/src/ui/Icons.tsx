import { useId } from 'react';
import type { GameKey } from '@casino/shared';

export function CoinIcon({ size = 18 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <defs>
        <radialGradient id={id} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.55" stopColor="#f2c14e" />
          <stop offset="1" stopColor="#8a5a12" />
        </radialGradient>
      </defs>
      <circle cx="10" cy="10" r="9" fill={`url(#${id})`} stroke="#8a5a12" strokeWidth="0.8" />
      <circle cx="10" cy="10" r="6" fill="none" stroke="#8a5a12" strokeOpacity="0.6" strokeWidth="0.8" />
      <path d="M10 6l1.2 2.6 2.8.3-2.1 1.9.6 2.8L10 12.2 7.5 13.6l.6-2.8L6 8.9l2.8-.3z" fill="#fff8e1" opacity="0.9" />
    </svg>
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
export function GameArt({ game }: { game: GameKey }) {
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
