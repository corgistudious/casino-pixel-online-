import { useId } from 'react';
import { Art, Beam, ChipStack, Coin, Die3D, KitDefs, PlayingCard, Sparkle } from './kit';

const useP = () => useId().replace(/:/g, '');

function Backdrop({ p, from, to }: { p: string; from: string; to: string }) {
  return (
    <>
      <radialGradient id={`${p}bd`} cx="50%" cy="20%" r="85%">
        <stop offset="0" stopColor={from} />
        <stop offset="1" stopColor={to} />
      </radialGradient>
      <rect width="400" height="300" fill={`url(#${p}bd)`} />
    </>
  );
}

/** Roulette wheel seen from ~25°: (cx, cy) is the hub, r the outer radius. */
export function RouletteWheel({ p, cx, cy, r, ballAngle = -0.6 }: { p: string; cx: number; cy: number; r: number; ballAngle?: number }) {
  const sy = 0.42;
  const n = 37;
  const rOut = r * 0.87;
  const rIn = r * 0.66;
  const pt = (rad: number, a: number) => `${(Math.cos(a) * rad).toFixed(2)} ${(Math.sin(a) * rad).toFixed(2)}`;
  return (
    <g>
      <defs>
        <radialGradient id={`${p}rw`} cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#9a5a28" />
          <stop offset="0.7" stopColor="#4a250e" />
          <stop offset="1" stopColor="#1c0c03" />
        </radialGradient>
        <radialGradient id={`${p}cone`} cx="45%" cy="35%" r="70%">
          <stop offset="0" stopColor="#d79a4a" />
          <stop offset="1" stopColor="#4a250e" />
        </radialGradient>
        <radialGradient id={`${p}ball`} cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#9a98ae" />
        </radialGradient>
      </defs>
      <ellipse cx={cx} cy={cy + r * 0.2} rx={r * 1.12} ry={r * 0.52} fill="#000" opacity="0.4" />
      <ellipse cx={cx} cy={cy + r * 0.1} rx={r} ry={r * sy} fill="#1c0c03" />
      <g transform={`translate(${cx} ${cy}) scale(1 ${sy})`}>
        <circle r={r} fill={`url(#${p}rw)`} stroke={`url(#${p}gold)`} strokeWidth={r * 0.03} />
        <circle r={r * 0.9} fill="none" stroke={`url(#${p}gold)`} strokeWidth={r * 0.012} />
        {Array.from({ length: n }, (_, i) => {
          const a0 = ((i - 0.5) / n) * Math.PI * 2;
          const a1 = ((i + 0.5) / n) * Math.PI * 2;
          const fill = i === 0 ? '#16a05e' : i % 2 ? '#c8102e' : '#16131f';
          return <path key={i} d={`M${pt(rOut, a0)} A${rOut} ${rOut} 0 0 1 ${pt(rOut, a1)} L${pt(rIn, a1)} A${rIn} ${rIn} 0 0 0 ${pt(rIn, a0)}Z`} fill={fill} stroke="#e8b64a" strokeWidth={r * 0.006} />;
        })}
        <circle r={rIn} fill={`url(#${p}cone)`} stroke={`url(#${p}gold)`} strokeWidth={r * 0.012} />
        <circle r={rIn * 0.78} fill="none" stroke="#2a1306" strokeOpacity="0.5" strokeWidth={r * 0.01} />
      </g>
      {/* Turret */}
      <ellipse cx={cx} cy={cy} rx={r * 0.17} ry={r * 0.07} fill={`url(#${p}goldV)`} />
      <rect x={cx - r * 0.05} y={cy - r * 0.22} width={r * 0.1} height={r * 0.22} fill={`url(#${p}gold)`} />
      <path d={`M${cx - r * 0.42} ${cy - r * 0.16} L${cx + r * 0.42} ${cy - r * 0.16}`} stroke={`url(#${p}gold)`} strokeWidth={r * 0.035} strokeLinecap="round" />
      <path d={`M${cx - r * 0.2} ${cy - r * 0.08} L${cx + r * 0.2} ${cy - r * 0.24}`} stroke={`url(#${p}goldV)`} strokeWidth={r * 0.03} strokeLinecap="round" />
      <circle cx={cx - r * 0.42} cy={cy - r * 0.16} r={r * 0.035} fill="#fff4c8" />
      <circle cx={cx + r * 0.42} cy={cy - r * 0.16} r={r * 0.035} fill="#fff4c8" />
      <circle cx={cx} cy={cy - r * 0.26} r={r * 0.06} fill={`url(#${p}goldV)`} />
      <circle cx={cx - r * 0.015} cy={cy - r * 0.28} r={r * 0.02} fill="#fff" opacity="0.8" />
      {/* Ball in the track */}
      <circle cx={cx + Math.cos(ballAngle) * r * 0.78} cy={cy + Math.sin(ballAngle) * r * 0.78 * sy} r={r * 0.045} fill={`url(#${p}ball)`} />
    </g>
  );
}

export function PokerArt() {
  const p = useP();
  return (
    <Art>
      <KitDefs p={p} />
      <Backdrop p={p} from="#2c2066" to="#07061a" />
      <Beam p={p} x={200} w={360} h={300} />
      <ellipse cx="200" cy="335" rx="270" ry="160" fill={`url(#${p}leather)`} />
      <ellipse cx="200" cy="338" rx="246" ry="140" fill={`url(#${p}felt)`} />
      <ellipse cx="200" cy="338" rx="232" ry="130" fill="none" stroke={`url(#${p}gold)`} strokeWidth="1.5" opacity="0.8" />
      {[
        ['Q', 'H'],
        ['J', 'S'],
        ['10', 'D'],
        ['9', 'C'],
        ['2', 'H'],
      ].map(([rank, suit], i) => (
        <g key={i} transform={`translate(${108 + i * 46} 232) scale(0.6 0.46)`} filter={`url(#${p}soft)`}>
          <PlayingCard p={p} rank={rank} suit={suit as 'H'} />
        </g>
      ))}
      <ChipStack x={318} y={262} count={6} color="red" r={18} />
      <ChipStack x={350} y={276} count={4} color="black" r={18} />
      <ChipStack x={292} y={282} count={3} color="blue" r={16} />
      <g transform="translate(70 270)">
        <ellipse cx="0" cy="5" rx="20" ry="8" fill="#000" opacity="0.35" />
        <ellipse cx="0" cy="3" rx="18" ry="7.5" fill="#bdb6cc" />
        <ellipse cx="0" cy="0" rx="18" ry="7.5" fill="#fbf8ff" />
        <text x="0" y="3.5" textAnchor="middle" fontSize="9" fontWeight="800" fill="#17142d">
          D
        </text>
      </g>
      <g filter={`url(#${p}shadow)`}>
        <g transform="translate(168 132) rotate(-13) scale(1.4)">
          <PlayingCard p={p} rank="A" suit="S" />
        </g>
        <g transform="translate(226 128) rotate(11) scale(1.4)">
          <PlayingCard p={p} rank="K" suit="S" />
        </g>
      </g>
      <Sparkle x={262} y={68} s={8} />
      <Sparkle x={128} y={84} s={5} o={0.7} />
    </Art>
  );
}

export function SicBoArt() {
  const p = useP();
  return (
    <Art>
      <KitDefs p={p} />
      <Backdrop p={p} from="#3a1f6e" to="#0a0618" />
      <defs>
        <linearGradient id={`${p}ivory`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9cfb8" />
          <stop offset="1" stopColor="#fbf6ea" />
        </linearGradient>
        <linearGradient id={`${p}glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <Beam p={p} x={200} w={320} h={300} />
      <ellipse cx="200" cy="330" rx="280" ry="110" fill={`url(#${p}felt)`} />
      {/* Bowl body */}
      <ellipse cx="200" cy="268" rx="78" ry="16" fill="#000" opacity="0.4" />
      <path d="M78 212 C 90 262, 150 268, 200 268 C 250 268, 310 262, 322 212 Z" fill={`url(#${p}goldV)`} />
      <path d="M96 222 C 112 252, 160 258, 200 258" stroke="#fff4c8" strokeOpacity="0.5" strokeWidth="3" fill="none" />
      {/* Back rim + inner surface */}
      <ellipse cx="200" cy="212" rx="124" ry="42" fill={`url(#${p}gold)`} />
      <ellipse cx="200" cy="212" rx="112" ry="34" fill={`url(#${p}ivory)`} />
      <Die3D x={158} y={196} a={22} top={6} left={5} right={3} />
      <Die3D x={204} y={186} a={22} top={1} left={2} right={4} />
      <Die3D x={248} y={200} a={22} top={4} left={6} right={2} />
      {/* Front rim lip over the dice */}
      <path d="M76 212 A124 42 0 0 0 324 212 A112 34 0 0 1 88 212 Z" fill={`url(#${p}gold)`} />
      {/* Glass dome lifted off */}
      <g transform="translate(318 92) rotate(20)">
        <ellipse cx="0" cy="34" rx="58" ry="14" fill="none" stroke={`url(#${p}gold)`} strokeWidth="4" />
        <path d="M-58 34 C -58 -30, 58 -30, 58 34" fill={`url(#${p}glass)`} stroke="#fff" strokeOpacity="0.45" strokeWidth="1.2" />
        <path d="M-40 18 C -38 -8, -18 -20, 0 -22" stroke="#fff" strokeOpacity="0.75" strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="0" cy="-22" r="7" fill={`url(#${p}goldV)`} />
      </g>
      <Coin x={62} y={262} size={52} kind="gold" rot={-12} />
      <Coin x={104} y={280} size={40} kind="gold" rot={8} />
      <Coin x={344} y={270} size={46} kind="silver" rot={10} />
      <Sparkle x={150} y={70} s={7} />
      <Sparkle x={250} y={140} s={5} o={0.7} />
    </Art>
  );
}

export function RouletteArt() {
  const p = useP();
  return (
    <Art>
      <KitDefs p={p} />
      <Backdrop p={p} from="#1d2a66" to="#060716" />
      <Beam p={p} x={200} w={380} h={300} />
      <rect y="200" width="400" height="100" fill={`url(#${p}felt)`} />
      <path d="M0 200 H400" stroke={`url(#${p}gold)`} strokeWidth="1.5" opacity="0.7" />
      <RouletteWheel p={p} cx={200} cy={160} r={150} ballAngle={-0.9} />
      <ChipStack x={60} y={270} count={5} color="purple" r={18} />
      <ChipStack x={92} y={284} count={3} color="red" r={16} />
      <ChipStack x={338} y={276} count={6} color="gold" r={18} />
      <Sparkle x={300} y={58} s={8} />
      <Sparkle x={96} y={74} s={5} o={0.7} />
    </Art>
  );
}

export function LiengArt() {
  const p = useP();
  return (
    <Art>
      <KitDefs p={p} />
      <Backdrop p={p} from="#5a1f6e" to="#12051f" />
      {/* Art-deco sunburst */}
      <g opacity="0.22" stroke={`url(#${p}gold)`} strokeWidth="1.2">
        {Array.from({ length: 19 }, (_, i) => {
          const a = Math.PI + (i / 18) * Math.PI;
          return <path key={i} d={`M200 250 L${200 + Math.cos(a) * 320} ${250 + Math.sin(a) * 320}`} />;
        })}
      </g>
      <circle cx="200" cy="150" r="96" fill={`url(#${p}glow)`} />
      <path d="M40 300 Q200 220 360 300 Z" fill={`url(#${p}felt)`} />
      <g filter={`url(#${p}shadow)`}>
        {(
          [
            ['3', 'H', -20],
            ['3', 'D', 0],
            ['3', 'S', 20],
          ] as const
        ).map(([rank, suit, rot], i) => (
          <g key={suit} transform={`translate(${168 + i * 32} ${158 + (i === 1 ? -8 : 0)}) rotate(${rot}) scale(1.5)`}>
            <PlayingCard p={p} rank={rank} suit={suit} />
          </g>
        ))}
      </g>
      <Coin x={60} y={250} size={56} kind="gold" rot={-10} />
      <Coin x={100} y={272} size={44} kind="gold" rot={14} />
      <Coin x={46} y={286} size={38} kind="gold" rot={4} />
      <Coin x={334} y={262} size={52} kind="gold" rot={12} />
      <Coin x={368} y={284} size={40} kind="silver" rot={-8} />
      <Sparkle x={292} y={64} s={8} />
      <Sparkle x={112} y={92} s={6} o={0.75} />
    </Art>
  );
}

export function XiToArt() {
  const p = useP();
  return (
    <Art>
      <KitDefs p={p} />
      <Backdrop p={p} from="#123a52" to="#050a18" />
      <Beam p={p} x={200} w={360} h={300} />
      <path d="M-20 300 L60 150 H340 L420 300 Z" fill={`url(#${p}felt)`} />
      <path d="M60 150 H340" stroke={`url(#${p}gold)`} strokeWidth="2" />
      <path d="M40 188 Q200 172 360 188" stroke={`url(#${p}gold)`} strokeWidth="1" opacity="0.6" fill="none" />
      <rect x="-20" y="284" width="440" height="20" fill={`url(#${p}wood)`} />
      <g filter={`url(#${p}shadow)`}>
        {(
          [
            [undefined, undefined, true],
            ['K', 'S', false],
            ['K', 'H', false],
            ['7', 'C', false],
            ['7', 'D', false],
          ] as const
        ).map(([rank, suit, back], i) => (
          <g key={i} transform={`translate(${84 + i * 58} ${132 - (i === 2 ? 8 : 0)}) rotate(${(i - 2) * 4}) scale(1.05)`}>
            <PlayingCard p={p} rank={rank} suit={suit} back={back} />
          </g>
        ))}
      </g>
      <ChipStack x={168} y={262} count={5} color="purple" r={18} />
      <ChipStack x={204} y={272} count={7} color="gold" r={19} />
      <ChipStack x={240} y={262} count={4} color="black" r={18} />
      <Sparkle x={330} y={70} s={7} />
    </Art>
  );
}

export function BlackjackArt() {
  const p = useP();
  return (
    <Art>
      <KitDefs p={p} />
      <Backdrop p={p} from="#0f4a3a" to="#04130f" />
      <path d="M-40 -20 H440 V180 Q200 330 -40 180 Z" fill={`url(#${p}felt)`} />
      <path id={`${p}arc`} d="M60 120 Q200 205 340 120" fill="none" />
      <path d="M40 104 Q200 215 360 104" stroke={`url(#${p}gold)`} strokeWidth="1.5" fill="none" opacity="0.8" />
      <path d="M70 132 Q200 222 330 132" stroke={`url(#${p}gold)`} strokeWidth="1" fill="none" opacity="0.55" />
      <text fontSize="11" fontWeight="700" letterSpacing="3" fill="#f7d77a" opacity="0.85">
        <textPath href={`#${p}arc`} startOffset="50%" textAnchor="middle">
          BLACKJACK PAYS 3 TO 2
        </textPath>
      </text>
      <path d="M-40 180 Q200 330 440 180 V300 H-40 Z" fill={`url(#${p}wood)`} />
      <g filter={`url(#${p}shadow)`}>
        <g transform="translate(172 128) rotate(-11) scale(1.45)">
          <PlayingCard p={p} rank="A" suit="H" />
        </g>
        <g transform="translate(230 124) rotate(9) scale(1.45)">
          <PlayingCard p={p} rank="K" suit="S" />
        </g>
      </g>
      <g transform="translate(322 66)" filter={`url(#${p}soft)`}>
        <circle r="26" fill={`url(#${p}goldV)`} />
        <circle r="21" fill="#1a1036" />
        <text y="8" textAnchor="middle" fontFamily="'Playfair Display', Georgia, serif" fontWeight="900" fontSize="22" fill="#f7d77a">
          21
        </text>
      </g>
      <ChipStack x={78} y={232} count={5} color="green" r={18} />
      <ChipStack x={108} y={246} count={3} color="red" r={16} />
      <Sparkle x={290} y={30} s={6} />
    </Art>
  );
}

/** Featured-table banner key art, composed for a portrait frame (600×640). */
export function BannerRouletteArt() {
  const p = useP();
  return (
    <Art viewBox="0 0 600 640">
      <KitDefs p={p} />
      <radialGradient id={`${p}bn`} cx="50%" cy="30%" r="80%">
        <stop offset="0" stopColor="#3a2a86" />
        <stop offset="0.55" stopColor="#170f3d" />
        <stop offset="1" stopColor="#06051a" />
      </radialGradient>
      <rect width="600" height="640" fill={`url(#${p}bn)`} />
      <path d="M250 0 L350 0 L560 520 L40 520 Z" fill={`url(#${p}beam)`} />
      <path d="M0 400 Q300 350 600 400 V640 H0 Z" fill={`url(#${p}felt)`} />
      <path d="M0 400 Q300 350 600 400" stroke={`url(#${p}gold)`} strokeWidth="2" fill="none" />
      <circle cx="300" cy="250" r="230" fill={`url(#${p}glow)`} />
      <RouletteWheel p={p} cx={300} cy={300} r={232} ballAngle={-1.15} />
      <g filter={`url(#${p}shadow)`}>
        <g transform="translate(500 120) rotate(22) scale(1.25)">
          <PlayingCard p={p} rank="A" suit="D" />
        </g>
        <g transform="translate(96 140) rotate(-20) scale(1.05)">
          <PlayingCard p={p} rank="K" suit="C" />
        </g>
      </g>
      <ChipStack x={84} y={470} count={7} color="red" r={30} />
      <ChipStack x={140} y={494} count={5} color="black" r={28} />
      <ChipStack x={520} y={470} count={6} color="gold" r={30} />
      <Coin x={190} y={60} size={70} kind="gold" rot={-18} />
      <Coin x={540} y={330} size={78} kind="gold" rot={14} />
      <Coin x={48} y={320} size={60} kind="silver" rot={-8} />
      <Sparkle x={420} y={40} s={10} />
      <Sparkle x={300} y={92} s={7} o={0.8} />
      <Sparkle x={60} y={230} s={6} o={0.7} />
    </Art>
  );
}

/** Gift chest overflowing with official Cxu coins (welcome / check-in banner), portrait 600×640. */
export function BannerGiftArt() {
  const p = useP();
  return (
    <Art viewBox="0 0 600 640">
      <KitDefs p={p} />
      <radialGradient id={`${p}bg`} cx="50%" cy="35%" r="80%">
        <stop offset="0" stopColor="#5b2a86" />
        <stop offset="0.6" stopColor="#1d0f3d" />
        <stop offset="1" stopColor="#07051a" />
      </radialGradient>
      <linearGradient id={`${p}box`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#d42a44" />
        <stop offset="1" stopColor="#6b0c1f" />
      </linearGradient>
      <linearGradient id={`${p}lid`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f0465f" />
        <stop offset="1" stopColor="#9c1d33" />
      </linearGradient>
      <rect width="600" height="640" fill={`url(#${p}bg)`} />
      <g opacity="0.25" stroke={`url(#${p}gold)`} strokeWidth="2">
        {Array.from({ length: 24 }, (_, i) => {
          const a = (i / 24) * Math.PI * 2;
          return <path key={i} d={`M300 250 L${300 + Math.cos(a) * 520} ${250 + Math.sin(a) * 520}`} />;
        })}
      </g>
      <circle cx="300" cy="260" r="220" fill={`url(#${p}glow)`} />
      {/* Lid behind the coins, tipped back */}
      <g transform="rotate(-10 140 220)">
        <path d="M120 222 Q300 120 480 222 V260 H120 Z" fill={`url(#${p}lid)`} />
        <rect x="280" y="160" width="40" height="100" fill={`url(#${p}goldV)`} />
        <path d="M120 260 H480" stroke={`url(#${p}gold)`} strokeWidth="8" />
      </g>
      <ellipse cx="300" cy="440" rx="220" ry="36" fill="#000" opacity="0.4" />
      <Coin x={300} y={232} size={128} kind="gold" rot={6} />
      <Coin x={210} y={262} size={100} kind="gold" rot={-14} />
      <Coin x={394} y={258} size={104} kind="silver" rot={16} />
      <Coin x={256} y={206} size={84} kind="silver" rot={-8} />
      <Coin x={350} y={196} size={86} kind="gold" rot={20} />
      {/* Chest body in front */}
      <path d="M130 290 H470 V420 Q300 445 130 420 Z" fill={`url(#${p}box)`} />
      <rect x="280" y="290" width="40" height="140" fill={`url(#${p}goldV)`} />
      <path d="M130 290 H470" stroke={`url(#${p}gold)`} strokeWidth="8" />
      <path d="M130 420 Q300 445 470 420" stroke={`url(#${p}gold)`} strokeWidth="8" fill="none" />
      <Coin x={96} y={420} size={70} kind="gold" rot={-20} />
      <Coin x={510} y={410} size={64} kind="silver" rot={12} />
      <Sparkle x={160} y={110} s={12} />
      <Sparkle x={460} y={130} s={9} />
      <Sparkle x={520} y={300} s={7} o={0.8} />
    </Art>
  );
}
