import { frameDef, type FrameArt, type FrameGlyph, type FrameOrnament } from '@casino/shared';
import { useId, type ReactElement } from 'react';

/**
 * Vector artwork for the Frame Library (podium, Hall of Fame, seasonal, tournament and role frames).
 * Drawn around the avatar circle in a 140-unit box whose inner 100 units are the avatar: a bevelled
 * metal ring (thicker and richer with the tier), real ornaments on top (crown, tiara, laurel,
 * wings…), an emblem medallion at the bottom and motifs around the ring. The centre stays empty so
 * the face is never covered. Nothing rotates: animation is a slow sheen across the metal and a few
 * twinkles, only when `animated` (large avatars) and never with reduced motion.
 */

const C = 70; // centre
const AVATAR_R = 50;

/** 24×24 glyph paths (filled). */
const GLYPHS: Record<FrameGlyph, string> = {
  spade: 'M12 2C9 6 3 9 3 14a4.5 4.5 0 0 0 7.6 3.2L9 22h6l-1.6-4.8A4.5 4.5 0 0 0 21 14c0-5-6-8-9-12z',
  dice: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2.5 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM7.5 15a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  wheel: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3 1.2 4.4L17 7l-2.4 3.8L19 12l-4.4 1.2L17 17l-3.8-2.4L12 19l-1.2-4.4L7 17l2.4-3.8L5 12l4.4-1.2L7 7l3.8 2.4z',
  cards: 'M4 6.5 11 4l3.5 13L7.5 19.5zM12.5 4.2 19 5.5 17.3 18 15.4 17.6 13 8.7z',
  chip: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zM11 2.1h2v3h-2zm0 16.8h2v3h-2zM2.1 11h3v2h-3zm16.8 0h3v2h-3z',
  ace: 'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm6 4-4 11h2.2l.8-2.4h2l.8 2.4H16zm0 4.2.6 2.4h-1.2z',
  vip: 'M2 7h3.2L7 13l1.8-6H12l-3.4 10H5.4zM13 7h2.8v10H13zm4.2 0H21a3 3 0 0 1 0 6h-1.2v4h-2.6zm2.6 2.3v1.6h.9a.8.8 0 0 0 0-1.6z',
  heart: 'M12 21s-9-5.6-9-11.6A5 5 0 0 1 12 6.3a5 5 0 0 1 9 3.1C21 15.4 12 21 12 21z',
  user: 'M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 10.5c4.8 0 8 2.4 8 5.5V21H4v-2c0-3.1 3.2-5.5 8-5.5z',
  trophy: 'M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V17h3v4H8v-4h3v-2.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3zm-1 4v1a2 2 0 0 0 1.4 1.9A6 6 0 0 1 7 8V7zm11 0v1c0 .7-.1 1.3-.4 1.9A2 2 0 0 0 18 8V7z',
  banner: 'M6 2h12v18l-6-3.5L6 20zm6 3.5L10.8 8l-2.8.3 2.1 1.8-.6 2.8L12 11.5l2.5 1.4-.6-2.8 2.1-1.8-2.8-.3z',
  star: 'M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 16.9 5.9 20.4l1.5-6.8L2.2 9l6.9-.7z',
  pumpkin: 'M11 3h2l.5 2.2C17 5 21 8 21 13s-4 8-9 8-9-3-9-8 4-8 7.5-7.8zM8 11l1.5 2L11 11zm5 0 1.5 2L16 11zm-5 4.5 1.5 1 1.5-1 1.5 1 1.5-1 1.5 1-1 1.5H9z',
  moon: 'M14.5 2A9.5 9.5 0 1 0 22 15a7.5 7.5 0 0 1-7.5-13z',
  ghost: 'M12 2a8 8 0 0 1 8 8v12l-2.7-2-2.6 2-2.7-2-2.7 2-2.6-2L4 22V10a8 8 0 0 1 8-8zM9 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  snowflake: 'M11 1h2v4.2l2.3-1.6 1.1 1.6L13 7.6v3.2l2.8-1.6.1-4 2 .1-.1 2.8 3.6-2.1 1 1.7-3.6 2.1 2.5 1.3-.9 1.8-3.6-1.9-2.8 1.6 2.8 1.6 3.6-1.9.9 1.8-2.5 1.3 3.6 2.1-1 1.7-3.6-2.1.1 2.8-2 .1-.1-4-2.8-1.6v3.2l3.4 2.4-1.1 1.6-2.3-1.6V23h-2v-4.2l-2.3 1.6-1.1-1.6 3.4-2.4v-3.2l-2.8 1.6-.1 4-2-.1.1-2.8-3.6 2.1-1-1.7 3.6-2.1-2.5-1.3.9-1.8 3.6 1.9 2.8-1.6-2.8-1.6-3.6 1.9-.9-1.8 2.5-1.3L1.5 6.5l1-1.7 3.6 2.1L6 4.1l2-.1.1 4 2.8 1.6V7.6L7.5 5.2l1.1-1.6L11 5.2z',
  tree: 'M12 1l4.5 6H14l4 5h-2.5L20 18h-7v4h-2v-4H4l4.5-6H6l4-5H7.5z',
  gift: 'M3 8h18v4H3zm1 5h7v8H4zm9 0h7v8h-7zM11 8h2v13h-2zM12 7c-1-3-5-4-5-1.5S10 7 12 7zm0 0c1-3 5-4 5-1.5S14 7 12 7z',
  firework: 'M12 2l1 6 4-4.5-2 5.8L21 8l-5 3.5 6 .5-6 1.5L21 17l-5.7-2 2.2 5.5-4-4.3L12 22l-1-5.8-4 4.3 2.2-5.5L3.5 17 8 13.5 2 12l6-.5L3 8l5.9 1.3L7 3.5l4 4.5z',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 4h2v5.6l3.7 2.2-1 1.7L11 12.7z',
  lantern: 'M11 1h2v2h1.5l1 2H18a5 5 0 0 1 0 12h-2.5l-1 2H13v3h-2v-3H9.5l-1-2H6A5 5 0 0 1 6 5h2.5l1-2H11zM9 8v8h1.5V8zm4.5 0v8H15V8z',
  blossom: 'M12 2c1.7 0 3 1.6 3 3.5 0 .5-.1 1-.3 1.4l.4-.3c1.5-1.1 3.6-.9 4.6.5s.4 3.4-1.1 4.5l-.4.2h.5c1.8.3 3 2 2.6 3.7-.4 1.7-2.1 2.7-3.9 2.3l-.5-.1.3.4c.8 1.6.1 3.6-1.5 4.3s-3.5-.1-4.2-1.7L12 20.5l-.5.4c-.7 1.6-2.6 2.4-4.2 1.7s-2.3-2.7-1.5-4.3l.3-.4-.5.1c-1.8.4-3.5-.6-3.9-2.3-.4-1.7.8-3.4 2.6-3.7h.5l-.4-.2C2.9 10.7 2.3 8.6 3.3 7.2s3.1-1.6 4.6-.5l.4.3c-.2-.4-.3-.9-.3-1.4C8 3.6 9.3 2 11 2zm0 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  dragon: 'M3 14c2-6 7-10 13-10l-2 3 4-1-1 3 4 1-4 2 2 3-4-1c-1 4-4 7-8 7l2-3-4 1 1-3-3-1zm11-6a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  rose: 'M12 3c3 0 6 2 6 5.5S15.5 14 12 14 6 12 6 8.5 9 3 12 3zm0 3c-1.2.5-2 1.5-2 2.6 0 1.4 1 2.4 2 2.4s2-1 2-2.4c0-1.1-.8-2.1-2-2.6zM11 14h2v8h-2zm2 3c2-2 4-2 6-1-1 2-3 3-6 3zm-2 1c-2-2-4-2-6-1 1 2 3 3 6 3z',
  sun: 'M12 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12zM11 0h2v4h-2zm0 20h2v4h-2zM0 11h4v2H0zm20 0h4v2h-4zM3.5 5l1.4-1.4 2.8 2.8-1.4 1.4zm12.8 12.8 1.4-1.4 2.8 2.8-1.4 1.4zM3.5 19l2.8-2.8 1.4 1.4L4.9 20.4zM16.3 6.2 19.1 3.4 20.5 4.8 17.7 7.6z',
  pearl: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm-3 3.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  wave: 'M1 13c2.5 0 3.5-3 6-3s3.5 3 6 3 3.5-3 6-3 3 2 4 2.5V16c-1-.5-2-2-4-2-2.5 0-3.5 3-6 3s-3.5-3-6-3-3.5 3-6 3z',
  rabbit: 'M8 2c1.5 0 2 3.5 2 6.5.6-.2 1.3-.3 2-.3s1.4.1 2 .3C14 5.5 14.5 2 16 2s1.8 4 .8 8C19 11.5 20 13.6 20 16c0 3.5-3.5 6-8 6s-8-2.5-8-6c0-2.4 1-4.5 3.2-6C6.2 6 6.5 2 8 2zm1.5 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm5 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  palace: 'M12 1l3 4h-1v2h5l-2 3h1v2h-2v8h3v2H5v-2h3v-8H6v-2h1L5 7h5V5H9zm-1.5 13v6h3v-6z',
  cake: 'M11 2h2v4h-2zM4 9h16v4c-1.3 0-2 1-4 1s-2.7-1-4-1-2 1-4 1-2.7-1-4-1zm0 6c1.3 0 2-1 4-1 1.5 0 2.5 1 4 1s2.5-1 4-1c2 0 2.7 1 4 1v6H4zM10 6h4v3h-4z',
  diamond: 'M7 3h10l5 6-10 13L2 9zm1.2 2L5 9h4l1.7-4zm5.1 0L15 9h4l-3.2-4zM10.9 9h2.2L12 6.3z',
  keyo: 'M5 3h3.5v7.2L15 3h4.3l-6.6 7.1L19.5 21h-4.3L10.3 12.9 8.5 14.8V21H5z',
  shield: 'M12 1l9 3.5V11c0 5.6-3.8 10.3-9 12-5.2-1.7-9-6.4-9-12V4.5zm0 4L8 7v4c0 3.3 1.7 6 4 7.4 2.3-1.4 4-4.1 4-7.4V7z',
  gavel: 'M13.5 2 21 9.5l-2.1 2.1-1.4-1.4-2.8 2.8 1.4 1.4-2.1 2.1L6.5 9l2.1-2.1 1.4 1.4 2.8-2.8-1.4-1.4zM8.4 14.2l1.4 1.4L4.1 21.3 2.7 19.9zM12 20h10v2H12z',
  eye: 'M12 5c5.5 0 9.5 4.5 10.8 7-1.3 2.5-5.3 7-10.8 7S2.5 14.5 1.2 12C2.5 9.5 6.5 5 12 5zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z',
  crown: 'M2 7l5 4 5-7 5 7 5-4-2 12H4zm2.5 13.5h15V22h-15z',
  bat: 'M12 7l1 2h2l2-3c1 2 3 3 6 3-2 1-3 3-3 5-1.5-1-3.5-1-5 0-.6.8-1.6 2-3 3-1.4-1-2.4-2.2-3-3-1.5-1-3.5-1-5 0 0-2-1-4-3-5 3 0 5-1 6-3l2 3h2z',
  mooncake: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 3.5L10.5 9H8l1.5 2.2L8.7 14 12 12.6l3.3 1.4-.8-2.8L16 9h-2.5z',
  coin: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2.5 7h5v6h-5z',
  medal: 'M7 2h4l1 4 1-4h4l-3 7.2A6.5 6.5 0 1 1 10 9.2zm5 9.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 1.5.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z',
};

function Glyph({ glyph, x, y, size, fill, opacity = 1 }: { glyph: FrameGlyph; x: number; y: number; size: number; fill: string; opacity?: number }) {
  return <path d={GLYPHS[glyph]} transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})`} fill={fill} fillOpacity={opacity} fillRule="evenodd" />;
}

function polar(r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
}

/** Angles for n motifs on both sides of the ring, keeping the top (ornament) and bottom (emblem) clear. */
function motifAngles(n: number): number[] {
  if (!n) return [];
  const half = Math.ceil(n / 2);
  const side = Array.from({ length: half }, (_, i) => 40 + ((180 - 80) * (i + 0.5)) / half);
  return [...side, ...side.map((a) => 360 - a)].slice(0, n);
}

function Ornament({ kind, ids, art, top }: { kind: FrameOrnament; ids: Record<string, string>; art: FrameArt; top: number }) {
  const p = art.palette;
  const metal = `url(#${ids.metal})`;
  const stroke = p.dark;
  switch (kind) {
    case 'crown':
      return (
        <g>
          <path d={`M44 ${top + 9} L48 ${top - 9} L57 ${top} L70 ${top - 14} L83 ${top} L92 ${top - 9} L96 ${top + 9} Z`} fill={metal} stroke={stroke} strokeWidth="1.2" strokeLinejoin="round" />
          <rect x="44" y={top + 7} width="52" height="6" rx="2" fill={metal} stroke={stroke} strokeWidth="1.1" />
          {[48, 70, 92].map((x, i) => (
            <circle key={x} cx={x} cy={top - (i === 1 ? 15 : 10)} r="2.6" fill={p.light} stroke={stroke} strokeWidth=".8" />
          ))}
          {[57, 70, 83].map((x) => (
            <path key={x} d={`M${x} ${top + 7.5} l2.6 2.5 -2.6 2.5 -2.6 -2.5z`} fill={p.accent} stroke={p.light} strokeWidth=".5" />
          ))}
        </g>
      );
    case 'tiara':
      return (
        <g>
          <path d={`M46 ${top + 10} Q70 ${top - 12} 94 ${top + 10} Q70 ${top + 2} 46 ${top + 10}Z`} fill={metal} stroke={stroke} strokeWidth="1.1" />
          <path d={`M70 ${top - 10} l5 7 -5 7 -5 -7z`} fill={p.accent} stroke={p.light} strokeWidth=".9" />
          {[56, 84].map((x) => (
            <circle key={x} cx={x} cy={top + 1.5} r="2.2" fill={p.light} stroke={stroke} strokeWidth=".6" />
          ))}
        </g>
      );
    case 'laurel': {
      const leaves = (dir: 1 | -1) =>
        Array.from({ length: 6 }, (_, i) => {
          const deg = dir * (10 + i * 11);
          const pt = polar(58, deg);
          return <ellipse key={`${dir}${i}`} cx={pt.x} cy={pt.y} rx="2.4" ry="5.2" transform={`rotate(${deg + dir * 40} ${pt.x} ${pt.y})`} fill={metal} stroke={stroke} strokeWidth=".7" />;
        });
      return (
        <g>
          {leaves(1)}
          {leaves(-1)}
          <circle cx={C} cy={top + 1} r="3" fill={p.accent} stroke={p.light} strokeWidth=".8" />
        </g>
      );
    }
    case 'wings': {
      const wing = (dir: 1 | -1) => (
        <path
          key={dir}
          d={`M${C + dir * 30} ${top + 22} C${C + dir * 52} ${top - 2} ${C + dir * 66} ${top + 4} ${C + dir * 68} ${top + 14} C${C + dir * 60} ${top + 12} ${C + dir * 60} ${top + 20} ${C + dir * 64} ${top + 26} C${C + dir * 56} ${top + 24} ${C + dir * 54} ${top + 32} ${C + dir * 56} ${top + 36} C${C + dir * 46} ${top + 32} ${C + dir * 38} ${top + 30} ${C + dir * 30} ${top + 22}Z`}
          fill={metal}
          stroke={stroke}
          strokeWidth="1"
        />
      );
      return (
        <g>
          {wing(1)}
          {wing(-1)}
          <Glyph glyph="star" x={C} y={top + 2} size={12} fill={p.light} />
        </g>
      );
    }
    case 'star':
      return (
        <g>
          <Glyph glyph="star" x={C} y={top} size={22} fill={p.dark} />
          <Glyph glyph="star" x={C} y={top} size={18} fill={metal} />
          <circle cx={C} cy={top} r="2.2" fill={p.accent} />
        </g>
      );
    case 'shield':
      return (
        <g>
          <Glyph glyph="shield" x={C} y={top + 1} size={22} fill={p.dark} />
          <Glyph glyph="shield" x={C} y={top + 1} size={18} fill={metal} />
          <circle cx={C} cy={top + 1} r="2.6" fill={p.accent} />
        </g>
      );
    case 'gem':
      return (
        <g>
          <path d={`M${C - 9} ${top - 2} L${C - 5} ${top - 8} H${C + 5} L${C + 9} ${top - 2} L${C} ${top + 9}Z`} fill={p.accent} stroke={p.dark} strokeWidth="1" />
          <path d={`M${C - 9} ${top - 2} H${C + 9} M${C - 5} ${top - 8} L${C - 2} ${top - 2} L${C} ${top + 9} L${C + 2} ${top - 2} L${C + 5} ${top - 8}`} stroke={p.light} strokeWidth=".6" fill="none" opacity=".8" />
        </g>
      );
    case 'horns':
      return (
        <g>
          {[1, -1].map((dir) => (
            <path key={dir} d={`M${C + dir * 22} ${top + 14} C${C + dir * 28} ${top + 2} ${C + dir * 36} ${top - 4} ${C + dir * 44} ${top - 6} C${C + dir * 40} ${top + 2} ${C + dir * 36} ${top + 10} ${C + dir * 34} ${top + 18}Z`} fill={metal} stroke={stroke} strokeWidth="1" />
          ))}
        </g>
      );
    default:
      return null;
  }
}

export function FrameArtSvg({ art, animated = false, simple = false }: { art: FrameArt; animated?: boolean; simple?: boolean }): ReactElement {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  const ids = { metal: `m${raw}`, sheen: `s${raw}`, clip: `c${raw}`, glow: `g${raw}`, medal: `d${raw}` };
  const p = art.palette;
  const band = 4.2 + art.tier * 1.3;
  const inner = AVATAR_R - 0.8;
  const mid = inner + band / 2;
  const outer = inner + band;
  const top = C - outer;
  const motifs = simple ? [] : motifAngles(art.motifCount);
  const studs = art.tier >= 4 && !simple ? [45, 135, 225, 315] : [];
  const beads = art.tier >= 3 && !simple ? Array.from({ length: 28 }, (_, i) => (360 / 28) * i).filter((a) => Math.min(Math.abs(a), Math.abs(360 - a), Math.abs(a - 180)) > 22) : [];
  const medal = polar(outer + 0.5, 180);
  const emblemR = simple ? 8.5 : 10.5;
  return (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden className="pointer-events-none overflow-visible">
      <defs>
        <linearGradient id={ids.metal} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={p.light} />
          <stop offset=".35" stopColor={p.mid} />
          <stop offset=".6" stopColor={p.dark} />
          <stop offset=".8" stopColor={p.mid} />
          <stop offset="1" stopColor={p.light} />
        </linearGradient>
        <radialGradient id={ids.glow} cx="50%" cy="50%" r="50%">
          <stop offset=".72" stopColor={p.glow} stopOpacity="0" />
          <stop offset=".86" stopColor={p.glow} stopOpacity=".35" />
          <stop offset="1" stopColor={p.glow} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={ids.medal} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor={p.mid} />
          <stop offset="1" stopColor={p.dark} />
        </radialGradient>
        <linearGradient id={ids.sheen} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".75" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={ids.clip}>
          <path d={`M${C} ${C - outer}a${outer} ${outer} 0 1 1 0 ${outer * 2}a${outer} ${outer} 0 1 1 0 ${-outer * 2}zM${C} ${C - inner}a${inner} ${inner} 0 1 0 0 ${inner * 2}a${inner} ${inner} 0 1 0 0 ${-inner * 2}z`} clipRule="evenodd" fillRule="evenodd" />
        </clipPath>
      </defs>
      {art.tier >= 3 && <circle cx={C} cy={C} r={outer + 9} fill={`url(#${ids.glow})`} />}
      {/* Ring with bevel: dark rim, metal band, light edge. */}
      <circle cx={C} cy={C} r={mid} fill="none" stroke={p.dark} strokeWidth={band + 1.6} />
      <circle cx={C} cy={C} r={mid} fill="none" stroke={`url(#${ids.metal})`} strokeWidth={band} />
      <circle cx={C} cy={C} r={outer - 0.7} fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth=".7" />
      <circle cx={C} cy={C} r={inner + 0.6} fill="none" stroke={p.dark} strokeOpacity=".8" strokeWidth=".8" />
      {art.tier >= 2 && <circle cx={C} cy={C} r={mid} fill="none" stroke={p.accent} strokeOpacity=".55" strokeWidth=".7" strokeDasharray={art.shape === 'season' ? '2 3' : undefined} />}
      {beads.map((a) => {
        const pt = polar(mid, a);
        return <circle key={a} cx={pt.x} cy={pt.y} r=".9" fill={p.light} fillOpacity=".85" />;
      })}
      {studs.map((a) => {
        const pt = polar(mid, a);
        return <path key={a} d={`M${pt.x} ${pt.y - 3.4}l3 3.4-3 3.4-3-3.4z`} fill={p.accent} stroke={p.light} strokeWidth=".7" />;
      })}
      {motifs.map((a) => {
        const pt = polar(outer + 1.5, a);
        return (
          <g key={a}>
            <circle cx={pt.x} cy={pt.y} r="5.6" fill={p.dark} stroke={p.mid} strokeWidth="1" />
            <Glyph glyph={art.motif!} x={pt.x} y={pt.y} size={8} fill={p.light} />
          </g>
        );
      })}
      {animated && !simple && art.sheen && (
        <g clipPath={`url(#${ids.clip})`}>
          <g className="kf-sheen">
            <rect x="-40" y="0" width="34" height="140" fill={`url(#${ids.sheen})`} transform="skewX(-20)" />
          </g>
        </g>
      )}
      <Ornament kind={simple && art.ornament !== 'crown' ? 'none' : art.ornament} ids={ids} art={art} top={top} />
      {/* Emblem medallion. */}
      <circle cx={medal.x} cy={medal.y} r={emblemR + 1.4} fill={p.dark} />
      <circle cx={medal.x} cy={medal.y} r={emblemR} fill={`url(#${ids.medal})`} stroke={p.light} strokeWidth="1.2" />
      <Glyph glyph={art.emblem} x={medal.x} y={medal.y} size={emblemR * 1.25} fill={p.light} />
      {animated && !simple && art.twinkle &&
        [30, 150, 250].map((a, i) => {
          const pt = polar(outer + 2, a);
          return <path key={a} className="kf-twinkle" style={{ animationDelay: `${i * 0.8}s` }} d={`M${pt.x} ${pt.y - 4}l1 3 3 1-3 1-1 3-1-3-3-1 3-1z`} fill="#fff" />;
        })}
    </svg>
  );
}

/** Library frame overlay for an avatar box of `size` px (the artwork spans 140% of it). */
export function LibraryFrame({ artId, size, animated = false }: { artId: string; size: number; animated?: boolean }) {
  const def = frameDef(artId);
  if (!def) return null;
  const box = size * 1.4;
  return (
    <div className="pointer-events-none absolute" style={{ width: box, height: box, left: (size - box) / 2, top: (size - box) / 2 }}>
      <FrameArtSvg art={def.art} animated={animated && size >= 48} simple={size < 36} />
    </div>
  );
}

export const isLibraryFrame = (artId: string | undefined | null) => !!artId && !!frameDef(artId);
