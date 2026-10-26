import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface StageInfo {
  /** Virtual stage size in design pixels. */
  width: number;
  height: number;
  /** Short screens (phones in landscape) use a 720-high design with larger relative sizes. */
  compact: boolean;
}

function measure(w: number, h: number): StageInfo & { scale: number } {
  const compact = h < 600;
  const designH = compact ? 720 : 1080;
  const minW = compact ? 1320 : 1640;
  const scale = Math.min(h / designH, w / minW);
  return { scale, width: w / scale, height: h / scale, compact };
}

/**
 * Game-style stage: content is laid out in design pixels (1080 or 720 high) and
 * scaled uniformly to the container, like a game engine canvas.
 */
export function Stage({ children }: { children: (info: StageInfo) => ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [m, setM] = useState(() => measure(window.innerWidth, window.innerHeight));

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const update = () => setM(measure(el.clientWidth || 1, el.clientHeight || 1));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={host} className="relative h-full w-full overflow-hidden">
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: m.width, height: m.height, transform: `scale(${m.scale})` }}>
        {children({ width: m.width, height: m.height, compact: m.compact })}
      </div>
    </div>
  );
}
