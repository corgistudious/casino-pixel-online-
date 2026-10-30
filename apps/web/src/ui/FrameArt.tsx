import { frameDef, type FrameArt, type FrameGlyph, type FrameOrnament } from '@casino/shared';
import { useId, type ReactElement } from 'react';
import { GLYPHS } from './glyphs';

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
