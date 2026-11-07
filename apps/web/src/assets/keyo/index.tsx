import { useState, type CSSProperties, type ReactNode } from 'react';
import { KEYO_ASSETS, type KeyoAssetEntry, type KeyoAssetId } from './registry.generated';

/**
 * Keyo asset loader — the one way the app shows Asset Studio art.
 *
 *  - Registry: registry.generated.ts (written by `node tools/asset-studio/src/cli.mjs export-web`).
 *    Ids are a TypeScript union, so an unknown id does not compile.
 *  - Sizing: every asset has several WebP variants; `keyoUrl` picks the smallest one that covers the
 *    displayed size × devicePixelRatio (a 44 px icon never downloads a 1024 px file).
 *  - Lazy by default: <KeyoImg> uses loading="lazy" + decoding="async", so a page only fetches what
 *    is on screen. Table scenes queue their own textures in Phaser's preload (game/assetTextures.ts).
 *  - Versioning / cache: file names carry a content hash, so new art always gets a new URL; the
 *    browser/Caddy cache rules for /assets/<folder>/ stay as they are.
 *  - Fallback: if a file fails to load, the component renders `fallback` (the existing drawn art), so
 *    a missing file never shows a broken image.
 */

export { KEYO_ASSETS, type KeyoAssetId };

const dpr = () => (typeof window === 'undefined' ? 2 : Math.min(3, Math.max(1, window.devicePixelRatio || 1)));

export const keyoAsset = (id: KeyoAssetId): KeyoAssetEntry => KEYO_ASSETS[id];
export const isKeyoAssetId = (id: string): id is KeyoAssetId => Object.prototype.hasOwnProperty.call(KEYO_ASSETS, id);

/** URL of the smallest variant whose long side is at least `px` device pixels (else the largest). */
export function keyoUrlPx(id: KeyoAssetId, px: number): string {
  const files = KEYO_ASSETS[id].files as Partial<Record<number, string>>;
  const sizes = Object.keys(files).map(Number).sort((a, b) => a - b);
  const pick = sizes.find((s) => s >= px) ?? sizes[sizes.length - 1]!;
  return files[pick]!;
}

/** URL for an image displayed `cssSize` CSS px wide (long side) on this screen. */
export const keyoUrl = (id: KeyoAssetId, cssSize: number) => keyoUrlPx(id, Math.ceil(cssSize * dpr()));

const decoded = new Map<string, Promise<void>>();
/** Fetches and decodes images ahead of time (e.g. the next screen); shared, never duplicated. */
export function preloadKeyo(ids: readonly KeyoAssetId[], cssSize: number): Promise<void> {
  if (typeof Image === 'undefined') return Promise.resolve();
  return Promise.all(
    ids.map((id) => {
      const url = keyoUrl(id, cssSize);
      let p = decoded.get(url);
      if (!p) {
        const img = new Image();
        img.src = url;
        p = img.decode().catch(() => decoded.delete(url)) as Promise<void>;
        decoded.set(url, p);
      }
      return p;
    }),
  ).then(() => undefined);
}

export interface KeyoImgProps {
  id: KeyoAssetId;
  /** Displayed long side in CSS px (also sets width/height so nothing shifts while loading). */
  size: number;
  alt: string;
  className?: string;
  style?: CSSProperties;
  /** Above the fold / needed immediately: fetch eagerly with high priority. */
  eager?: boolean;
  /** Rendered instead when the file fails to load (normally the existing drawn artwork). */
  fallback?: ReactNode;
  /** Decorative image: hidden from assistive tech. */
  decorative?: boolean;
  title?: string;
}

export function KeyoImg({ id, size, alt, className = '', style, eager = false, fallback = null, decorative = false, title }: KeyoImgProps) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  const a = KEYO_ASSETS[id];
  const w = a.w >= a.h ? size : Math.round((size * a.w) / a.h);
  const h = a.h >= a.w ? size : Math.round((size * a.h) / a.w);
  return (
    <img
      src={keyoUrl(id, size)}
      alt={decorative ? '' : alt}
      aria-hidden={decorative || undefined}
      title={title}
      width={w}
      height={h}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      // React 19 passes fetchPriority through to the DOM.
      fetchPriority={eager ? 'high' : undefined}
      draggable={false}
      data-keyo-asset={id}
      onError={() => setFailed(true)}
      className={`select-none object-contain ${className}`}
      style={{ width: w, height: h, ...style }}
    />
  );
}

/**
 * Shows only the visible artwork of an asset (its alpha box) stretched uniformly into a w×h box —
 * e.g. a card back filling exactly a card's footprint despite the file's transparent margin.
 */
export function KeyoFit({ id, w, h, alt = '', className = '', fallback = null }: { id: KeyoAssetId; w: number; h: number; alt?: string; className?: string; fallback?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  const a = KEYO_ASSETS[id];
  const [bx, by, bw, bh] = a.box.map((v) => v / 1000) as [number, number, number, number];
  const fullW = w / bw;
  const fullH = h / bh;
  return (
    <span role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true} className={`relative inline-block shrink-0 overflow-hidden ${className}`} style={{ width: w, height: h }}>
      <img
        src={keyoUrl(id, Math.max(fullW, fullH))}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
        data-keyo-asset={id}
        onError={() => setFailed(true)}
        className="absolute max-w-none select-none"
        style={{ width: fullW, height: fullH, left: -bx * fullW, top: -by * fullH }}
      />
    </span>
  );
}
