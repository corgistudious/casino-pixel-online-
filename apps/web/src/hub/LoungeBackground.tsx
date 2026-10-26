import { useEffect, useRef } from 'react';
import { useSettings } from '../store/settings';

interface Mote {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  sprite: HTMLCanvasElement;
  a: number;
  phase: number;
}

const HUES = ['255,205,110', '200,120,255', '120,200,255', '255,150,200'];
/** The scene is soft by nature, so it renders at half resolution and is scaled up by CSS. */
const RES = 0.5;

function bokehSprite(hue: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, `rgba(${hue},1)`);
  rg.addColorStop(1, `rgba(${hue},0)`);
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  return c;
}

/**
 * Animated casino lounge: deep navy-to-purple atmosphere, slow light shafts,
 * drifting bokeh and a polished floor glow. Static layers are cached; only
 * the beams and bokeh are drawn per frame. Pauses when hidden; static with reduced motion or on devices too slow for smooth playback.
 */
export function LoungeBackground() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useSettings((s) => s.reduceMotion);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const sprites = HUES.map(bokehSprite);
    const base = document.createElement('canvas');
    const bctx = base.getContext('2d')!;
    let w = 0;
    let h = 0;
    let raf = 0;
    let motes: Mote[] = [];
    // Adaptive quality: if the device cannot hold ~45 FPS, freeze the ambience on a still frame.
    let last = 0;
    let frames = 0;
    let slowTime = 0;
    let frozen = false;

    const paintBase = () => {
      base.width = el.width;
      base.height = el.height;
      bctx.setTransform(RES, 0, 0, RES, 0, 0);
      const g = bctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#120a32');
      g.addColorStop(0.55, '#0b0822');
      g.addColorStop(1, '#05040f');
      bctx.fillStyle = g;
      bctx.fillRect(0, 0, w, h);
      const haze = bctx.createRadialGradient(w * 0.72, h * 0.1, 0, w * 0.72, h * 0.1, w * 0.6);
      haze.addColorStop(0, 'rgba(110,60,200,0.35)');
      haze.addColorStop(1, 'rgba(110,60,200,0)');
      bctx.fillStyle = haze;
      bctx.fillRect(0, 0, w, h);
      const em = bctx.createRadialGradient(w * 0.15, h * 1.05, 0, w * 0.15, h * 1.05, w * 0.5);
      em.addColorStop(0, 'rgba(20,140,90,0.28)');
      em.addColorStop(1, 'rgba(20,140,90,0)');
      bctx.fillStyle = em;
      bctx.fillRect(0, 0, w, h);
      const floor = bctx.createLinearGradient(0, h * 0.78, 0, h);
      floor.addColorStop(0, 'rgba(242,193,78,0)');
      floor.addColorStop(1, 'rgba(242,193,78,0.08)');
      bctx.fillStyle = floor;
      bctx.fillRect(0, h * 0.78, w, h * 0.22);
    };

    const resize = () => {
      w = Math.max(1, el.clientWidth);
      h = Math.max(1, el.clientHeight);
      el.width = Math.round(w * RES);
      el.height = Math.round(h * RES);
      ctx.setTransform(RES, 0, 0, RES, 0, 0);
      paintBase();
      const count = Math.min(90, Math.round((w * h) / 26000));
      motes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h * 0.85,
        r: 6 + Math.random() * 34,
        vx: (Math.random() - 0.5) * 0.08,
        vy: -0.02 - Math.random() * 0.06,
        sprite: sprites[Math.floor(Math.random() * sprites.length)]!,
        a: 0.05 + Math.random() * 0.12,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const beam = (cx: number) => {
      const g = ctx.createLinearGradient(0, 0, 0, h * 0.9);
      g.addColorStop(0, 'rgba(255,230,170,0.07)');
      g.addColorStop(1, 'rgba(255,230,170,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.03, 0);
      ctx.lineTo(cx + w * 0.03, 0);
      ctx.lineTo(cx + w * 0.14, h * 0.9);
      ctx.lineTo(cx - w * 0.14, h * 0.9);
      ctx.closePath();
      ctx.fill();
    };

    const draw = (t: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(base, 0, 0);
      ctx.setTransform(RES, 0, 0, RES, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) beam(w * (0.25 + i * 0.27) + Math.sin(t / 7000 + i * 2) * w * 0.03);
      for (const m of motes) {
        ctx.globalAlpha = m.a * (0.75 + Math.sin(t / 1600 + m.phase) * 0.25);
        ctx.drawImage(m.sprite, m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    const step = (t: number) => {
      if (last) {
        const dt = t - last;
        frames++;
        if (dt > 22) slowTime += dt;
        if (frames > 45 && slowTime > 1500) {
          frozen = true;
          draw(t);
          return;
        }
        if (frames % 240 === 0) slowTime = 0;
      }
      last = t;
      for (const m of motes) {
        m.x += m.vx;
        m.y += m.vy;
        if (m.y < -m.r) {
          m.y = h * 0.9;
          m.x = Math.random() * w;
        }
        if (m.x < -m.r) m.x = w + m.r;
        if (m.x > w + m.r) m.x = -m.r;
      }
      draw(t);
      raf = requestAnimationFrame(step);
    };

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduceMotion || frozen) draw(0);
    });
    ro.observe(el);
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      last = 0;
      if (!document.hidden && !reduceMotion && !frozen) raf = requestAnimationFrame(step);
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (reduceMotion) draw(0);
    else raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduceMotion]);

  return <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}
