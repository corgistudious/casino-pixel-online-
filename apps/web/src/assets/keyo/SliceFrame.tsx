import { useState, type CSSProperties, type ReactNode } from 'react';
import { KEYO_ASSETS, keyoUrl, type KeyoAssetId } from './index';

/**
 * Nine-slice frame for wide studio plaques (chat bubbles, titles): the ornate corners keep their
 * shape and the edges/centre stretch to any text length, so long VI/EN text never distorts the art.
 * The transparent margin of the file is pushed outside the element (it is not counted in layout).
 *
 * `cut` = size of the fixed corner regions as fractions of the visible artwork (alpha box);
 * `scale` = screen px per source px (corners render at cut × box × scale px). `mirror` flips the
 * art horizontally (own messages put the tail on the other side). If the file fails to load the
 * element renders `fallback` instead.
 */
export interface SliceCut {
  t: number;
  r: number;
  b: number;
  l: number;
}

export function sliceGeometry(id: KeyoAssetId, cut: SliceCut, scale: number, mirror = false) {
  const a = KEYO_ASSETS[id];
  const [bx, by, bw, bh] = a.box.map((v) => v / 1000) as [number, number, number, number];
  const W = a.w;
  const H = a.h;
  const m = { t: by * H, b: (1 - by - bh) * H, l: bx * W, r: (1 - bx - bw) * W };
  const c = { t: cut.t * bh * H, b: cut.b * bh * H, l: cut.l * bw * W, r: cut.r * bw * W };
  const slice = { t: ((m.t + c.t) / H) * 100, b: ((m.b + c.b) / H) * 100, l: ((m.l + c.l) / W) * 100, r: ((m.r + c.r) / W) * 100 };
  const px = (v: number) => Math.round(v * scale * 10) / 10;
  // When mirrored, the decorative layer is flipped, so its left slice ends up on the right.
  const L = mirror ? 'r' : 'l';
  const R = mirror ? 'l' : 'r';
  return {
    layer: {
      borderStyle: 'solid',
      borderImageSource: `url("${keyoUrl(id, Math.max(160, W * scale * 1.2))}")`,
      borderImageSlice: `${slice.t}% ${slice.r}% ${slice.b}% ${slice.l}% fill`,
      borderImageRepeat: 'stretch',
      borderWidth: `${px(m.t + c.t)}px ${px(m.r + c.r)}px ${px(m.b + c.b)}px ${px(m.l + c.l)}px`,
      top: -px(m.t),
      bottom: -px(m.b),
      left: -px(m[L]),
      right: -px(m[R]),
      transform: mirror ? 'scaleX(-1)' : undefined,
    } satisfies CSSProperties,
    padding: { t: px(c.t), b: px(c.b), l: px(c[L]), r: px(c[R]) },
  };
}

export function SliceFrame({
  id,
  cut,
  scale,
  mirror = false,
  className = '',
  style,
  pad = { t: 0, r: 0, b: 0, l: 0 },
  fallback,
  children,
  ...data
}: {
  id: KeyoAssetId;
  cut: SliceCut;
  scale: number;
  mirror?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Extra padding (px) added to the corner regions. */
  pad?: SliceCut;
  fallback: ReactNode;
  children: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  const g = sliceGeometry(id, cut, scale, mirror);
  const probe = keyoUrl(id, Math.max(160, KEYO_ASSETS[id].w * scale * 1.2));
  return (
    <div
      {...data}
      data-keyo-asset={id}
      className={`relative isolate ${className}`}
      style={{ paddingTop: g.padding.t + pad.t, paddingBottom: g.padding.b + pad.b, paddingLeft: g.padding.l + pad.l, paddingRight: g.padding.r + pad.r, ...style }}
    >
      <span aria-hidden className="pointer-events-none absolute -z-10 box-border" style={g.layer} />
      {/* border-image has no error event: a hidden probe image reports a failed file. */}
      <img src={probe} alt="" hidden onError={() => setFailed(true)} />
      {children}
    </div>
  );
}
