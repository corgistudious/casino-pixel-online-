import { useEffect, useRef } from 'react';
import { paintTable, type OvalGeometry, type TableLayout } from './tableArt';

/**
 * A table skin painted into a canvas that fills its parent (shop previews and the HTML Blackjack
 * table). Design size 800×500 scaled to the element; repainted only when the skin or size changes.
 */
export function TableSkinCanvas({ skinId, layout, className = '', oval }: { skinId: string | null | undefined; layout: TableLayout; className?: string; oval?: OvalGeometry }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const W = 800;
      const H = Math.round((800 * rect.height) / rect.width);
      ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
      paintTable(ctx, W, H, skinId, layout, oval ?? (layout === 'oval' ? { cx: W / 2, cy: H * 0.5, rx: W * 0.38, ry: H * 0.34 } : undefined));
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [skinId, layout, oval]);
  return <canvas ref={ref} aria-hidden className={`block h-full w-full ${className}`} />;
}
