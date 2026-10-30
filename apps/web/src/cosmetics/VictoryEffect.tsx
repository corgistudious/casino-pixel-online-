import { cosmeticDef, type EffectArt, type FrameGlyph } from '@casino/shared';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';
import { drawGlyph } from '../ui/glyphs';

/**
 * Victory effects are PERSONAL: only the winner's own screen plays the effect they equipped; other
 * players at the table see the normal result. `celebrateWin` is called where the client receives a
 * SETTLED result from the server showing the viewer won (never from local guesses). Each round key
 * plays at most once — remembered for the session so a reconnect, a retry or a re-render does not
 * replay it. One effect at a time, short (~2.2 s), never intercepts clicks, honours Reduced Motion
 * and the player's "victory effects" setting.
 */

type Play = { effect: string; big: boolean; preview: boolean };
const listeners = new Set<(p: Play) => void>();
const PLAYED_KEY = 'kfx.played';
const played: string[] = (() => {
  try {
    return JSON.parse(sessionStorage.getItem(PLAYED_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
})();

export function celebrateWin(roundKey: string, opts: { big?: boolean } = {}) {
  if (played.includes(roundKey)) return;
  played.push(roundKey);
  if (played.length > 60) played.splice(0, played.length - 60);
  try {
    sessionStorage.setItem(PLAYED_KEY, JSON.stringify(played));
  } catch {
    /* private mode: in-memory only */
  }
  const effect = useSession.getState().user?.victoryEffect;
  if (!effect || !useSettings.getState().victoryEffects) return;
  listeners.forEach((l) => l({ effect, big: !!opts.big, preview: false }));
}

/** Shop/inventory preview: plays an effect locally; no game event, no purchase. */
export function previewVictory(effect: string) {
  listeners.forEach((l) => l({ effect, big: true, preview: true }));
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  vr: number;
  size: number;
  glyph: FrameGlyph;
  color: string;
  phase: number;
}

function spawn(a: EffectArt, w: number, h: number, scale: number): Particle[] {
  const n = Math.round(a.count * (w < 700 ? 0.7 : 1));
  return Array.from({ length: n }, (_, i) => {
    const glyph = a.particles[i % a.particles.length]!;
    const color = a.colors[i % a.colors.length]!;
    const size = (14 + Math.random() * 14) * scale;
    const angle = Math.random() * Math.PI * 2;
    const speed = (180 + Math.random() * 260) * scale;
    switch (a.motion) {
      case 'rain':
        return { x: Math.random() * w, y: -40 - Math.random() * h * 0.6, vx: (Math.random() - 0.5) * 40, vy: (220 + Math.random() * 180) * scale, r: Math.random() * 6, vr: (Math.random() - 0.5) * 4, size, glyph, color, phase: Math.random() };
      case 'rise':
        return { x: Math.random() * w, y: h + 30 + Math.random() * h * 0.3, vx: (Math.random() - 0.5) * 30, vy: -(140 + Math.random() * 150) * scale, r: 0, vr: (Math.random() - 0.5), size, glyph, color, phase: Math.random() * 6 };
      case 'sparkle':
        return { x: w * 0.1 + Math.random() * w * 0.8, y: h * 0.1 + Math.random() * h * 0.8, vx: 0, vy: 0, r: Math.random() * 6, vr: 0.6, size, glyph, color, phase: Math.random() };
      case 'swirl':
        return { x: w / 2, y: h / 2, vx: angle, vy: 40 + Math.random() * 60, r: 0, vr: 1.5 + Math.random(), size, glyph, color, phase: Math.random() * 0.4 };
      default:
        return { x: w / 2, y: h * 0.45, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 80 * scale, r: Math.random() * 6, vr: (Math.random() - 0.5) * 6, size, glyph, color, phase: 0 };
    }
  });
}

const DURATION = 2200;

export function VictoryEffectHost() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [play, setPlay] = useState<Play | null>(null);
  const reduceMotion = useSettings((s) => s.reduceMotion);

  useEffect(() => {
    const on = (p: Play) => setPlay((cur) => cur ?? p); // never stack effects
    listeners.add(on);
    return () => void listeners.delete(on);
  }, []);

  useEffect(() => {
    if (!play) return;
    const def = cosmeticDef(play.effect);
    const canvas = ref.current;
    if (def?.kind !== 'victory_effect' || !canvas) return setPlay(null);
    const a = def.art;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scale = Math.max(0.7, Math.min(1.4, Math.min(w, h) / 420));
    const calm = reduceMotion || matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const parts = calm ? [] : spawn(a, w, h, scale);
    const start = performance.now();
    let last = start;
    let raf = 0;
    const frame = (now: number) => {
      const t = now - start;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const total = calm ? 1100 : DURATION;
      const fade = t > total - 400 ? Math.max(0, (total - t) / 400) : 1;
      ctx.clearRect(0, 0, w, h);
      // Glow behind the centre.
      const g = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.min(w, h) * 0.5);
      g.addColorStop(0, `${a.glow}55`);
      g.addColorStop(1, `${a.glow}00`);
      ctx.globalAlpha = fade * Math.min(1, t / 250);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      if (a.centre) {
        const k = calm ? 1 : Math.min(1, t / 380);
        const bounce = calm ? 1 : 1 + Math.sin(Math.min(1, t / 520) * Math.PI) * 0.18;
        const size = Math.min(w, h) * 0.2 * k * bounce;
        ctx.shadowColor = a.glow;
        ctx.shadowBlur = 24;
        drawGlyph(ctx, a.centre, w / 2, h * 0.45, size, a.colors[0]!);
        ctx.shadowBlur = 0;
      }
      for (const p of parts) {
        if (a.motion === 'swirl') {
          const ang = p.vx + (t / 1000) * p.vr * Math.PI;
          const rad = (p.vy + t * 0.12) * scale;
          p.x = w / 2 + Math.cos(ang) * rad;
          p.y = h * 0.45 + Math.sin(ang) * rad * 0.7;
        } else if (a.motion === 'sparkle') {
          // stay in place, twinkle
        } else {
          p.x += (p.vx + (a.motion === 'rise' ? Math.sin(t / 300 + p.phase) * 30 : 0)) * dt;
          p.y += p.vy * dt;
          if (a.motion === 'burst') {
            p.vx *= 0.985;
            p.vy = p.vy * 0.985 + 420 * scale * dt;
          }
          p.r += p.vr * dt;
        }
        const tw = a.motion === 'sparkle' ? Math.max(0, Math.sin((t / 600 + p.phase) * Math.PI)) : 1;
        ctx.globalAlpha = fade * tw;
        drawGlyph(ctx, p.glyph, p.x, p.y, p.size * (a.motion === 'sparkle' ? 0.6 + tw * 0.6 : 1), p.color, p.r);
      }
      ctx.globalAlpha = 1;
      if (t < total) raf = requestAnimationFrame(frame);
      else {
        ctx.clearRect(0, 0, w, h);
        setPlay(null);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [play, reduceMotion]);

  return <canvas ref={ref} data-victory-effect={play?.effect ?? ''} aria-hidden className={`pointer-events-none fixed inset-0 z-[95] h-full w-full ${play ? '' : 'hidden'}`} />;
}
