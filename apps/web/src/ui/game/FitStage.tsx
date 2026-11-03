import { useRef, type ReactNode } from 'react';
import { useStableSize } from '../../lib/viewport';

/** Pure: the largest `ratio` box that fits in w×h (never stretched). */
export function fitBox(w: number, h: number, ratio: number): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 0, h: 0 };
  return w / h > ratio ? { w: Math.floor(h * ratio), h: Math.floor(h) } : { w: Math.floor(w), h: Math.floor(w / ratio) };
}

/**
 * Stage for HTML tables (Blackjack multiplayer): the felt keeps its aspect ratio and takes the
 * largest box the stage allows, like Phaser's FIT mode, without a CSS transform (a transform would
 * re-anchor the fixed-position player menus opened from the seats). `scale` = box width / design
 * width, for sizing cards; text keeps its readable size.
 */
export function FitStage({ ratio, designWidth, children }: { ratio: number; designWidth: number; children: (scale: number) => ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const box = useStableSize(host);
  const fit = box ? fitBox(box.w, box.h, ratio) : null;
  return (
    <div ref={host} className="gstage-canvas flex items-center justify-center">
      {fit && fit.w > 0 && (
        <div data-fit-stage style={{ width: fit.w, height: fit.h }} className="relative">
          {children(fit.w / designWidth)}
        </div>
      )}
    </div>
  );
}
