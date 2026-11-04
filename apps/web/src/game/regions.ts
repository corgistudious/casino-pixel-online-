import { PORTRAIT_W } from './hd';

/** A slice of the landscape world shown in the portrait column (region scenes). */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Upper bound for the slice's zoom (it otherwise fills the column width). */
  maxZoom?: number;
  /** Extra space under the slice, in column units. */
  gap?: number;
}

export interface PlacedRegion {
  region: Region;
  zoom: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Pure: stack slices top to bottom in a column `width` wide (each centred, zoomed to fit). */
export function stackRegions(regions: Region[], width = PORTRAIT_W, pad = 4): { placed: PlacedRegion[]; height: number } {
  let y = pad;
  const placed = regions.map((region) => {
    const zoom = Math.min(region.maxZoom ?? Infinity, (width - 2 * pad) / region.w);
    const w = region.w * zoom;
    const h = region.h * zoom;
    const p = { region, zoom, x: (width - w) / 2, y, w, h };
    y += h + (region.gap ?? pad);
    return p;
  });
  return { placed, height: Math.ceil(y - (regions.at(-1)?.gap ?? pad) + pad) };
}

