import { useEffect, useRef, useState } from 'react';
import { paintTable, type OvalGeometry, type TableLayout } from './tableArt';
import { keyoUrl } from '../assets/keyo';
import { FELT_BAND_TARGET, studioFelt } from '../assets/keyo/bindings';

/**
 * A table skin painted into a canvas that fills its parent (shop previews and the HTML Blackjack
 * table). Design size 800×500 scaled to the element; repainted only when the skin or size changes.
 */
export function TableSkinCanvas(props: { skinId: string | null | undefined; layout: TableLayout; className?: string; oval?: OvalGeometry }) {
  const [failed, setFailed] = useState(false);
  const felt = !failed && props.skinId && !props.oval ? studioFelt(props.skinId, props.layout) : null;
  if (!felt) return <PaintedTable {...props} />;
  // Studio felt (assets/keyo/bindings.ts): cover, or its painted oval placed where the drawn oval would be.
  const o = felt.oval;
  const b = felt.band;
  const bandH = b ? ((FELT_BAND_TARGET.bottom - FELT_BAND_TARGET.top) / (b.bottom - b.top)) * 100 : 0;
  const style = b
    ? { height: `${bandH}%`, width: 'auto', minWidth: '100%', maxWidth: 'none', left: '50%', transform: 'translateX(-50%)', top: `${FELT_BAND_TARGET.top * 100 - b.top * bandH}%`, objectFit: 'cover' as const }
    : o
    ? { width: `${(0.38 / o.rx) * 100}%`, height: `${(0.34 / o.ry) * 100}%`, left: `${50 - o.cx * (0.38 / o.rx) * 100}%`, top: `${50 - o.cy * (0.34 / o.ry) * 100}%`, maxWidth: 'none' }
    : { inset: 0, width: '100%', height: '100%', objectFit: 'cover' as const };
  return (
    <div aria-hidden className={`relative block h-full w-full overflow-hidden bg-[#120818] ${props.className ?? ''}`}>
      <img src={keyoUrl(felt.id, 800)} alt="" decoding="async" draggable={false} onError={() => setFailed(true)} className="absolute select-none" style={style} data-keyo-asset={felt.id} />
    </div>
  );
}

function PaintedTable({ skinId, layout, className = '', oval }: { skinId: string | null | undefined; layout: TableLayout; className?: string; oval?: OvalGeometry }) {
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
