import Phaser from 'phaser';
import { useEffect, useRef, useState } from 'react';
import { useStableSize } from '../lib/viewport';
import { useSettings } from '../store/settings';
import { formFactor } from '../lib/device';
import { tablePortraitLayout } from '../lib/orientation';
import { markBoot } from '../lib/viewportProbe';
import { RES } from './hd';
import { viewerTableSkin, type BaseScene } from './scenes/BaseScene';

/** Mounts a Phaser game running a single scene and hands the scene to React once it is ready. */
export function PhaserView<S extends BaseScene>({ create, onReady }: { create: () => S; onReady: (scene: S) => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  // Phaser FIT scales to its parent: the parent keeps the stable box so the on-screen keyboard never
  // shrinks the table (its bottom is clipped behind the keyboard instead). See lib/viewport.ts.
  const box = useStableSize(frame);
  const gameRef = useRef<Phaser.Game | null>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  // The viewer's own table skin, fixed for the scene's lifetime (exposed for QA, never sent anywhere).
  const [skin] = useState(viewerTableSkin);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape' | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const scene = create();
    scene.reduceMotion = useSettings.getState().reduceMotion;
    // Phones and tablets always play in landscape (held upright, they are covered by the rotate
    // notice, so the scene never needs to switch). Only a taller-than-wide PC window gets the portrait
    // layout. Chosen once per mount: a rotation / resize never tears down a running round.
    const rect = frame.current?.getBoundingClientRect();
    scene.portrait = tablePortraitLayout(formFactor(), rect ? { w: rect.width, h: rect.height } : null);
    const size = scene.canvasSize();
    setOrientation(scene.portrait ? 'portrait' : 'landscape');
    markBoot('phaser-init');
    // Phaser 3.90's Game.start() calls VisibilityHandler, which adds a document 'visibilitychange'
    // listener (and sets window.onblur / onfocus) that Game.destroy() never removes: every room visit
    // leaked the whole destroyed game. postBoot runs synchronously right before it inside start(), so
    // the listener is captured there (only for that synchronous call) and removed on unmount.
    const captured: [string, EventListenerOrEventListenerObject][] = [];
    let onBlur: typeof window.onblur = null;
    let onFocus: typeof window.onfocus = null;
    const postBoot = () => {
      const docAdd = document.addEventListener;
      const ownAdd = Object.prototype.hasOwnProperty.call(document, 'addEventListener');
      document.addEventListener = function (this: Document, type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) {
        if (fn && /visibilitychange$/.test(type)) captured.push([type, fn]);
        return docAdd.call(this, type, fn, opts);
      } as typeof document.addEventListener;
      queueMicrotask(() => {
        if (ownAdd) document.addEventListener = docAdd;
        else delete (document as { addEventListener?: unknown }).addEventListener;
        onBlur = window.onblur;
        onFocus = window.onfocus;
      });
    };
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: Math.round(size.w * RES),
      height: Math.round(size.h * RES),
      backgroundColor: '#07060f',
      antialias: true,
      pixelArt: false,
      roundPixels: false,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      audio: { noAudio: true },
      banner: false,
      callbacks: { postBoot },
      scene,
    });
    gameRef.current = game;
    let alive = true;
    void scene.ready.then(() => alive && readyRef.current(scene));
    return () => {
      alive = false;
      gameRef.current = null;
      game.destroy(true);
      for (const [type, fn] of captured) document.removeEventListener(type, fn);
      if (onBlur && window.onblur === onBlur) window.onblur = null;
      if (onFocus && window.onfocus === onFocus) window.onfocus = null;
    };
    // The scene factory is stable per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phaser only re-fits on window resize; the layout around the table can change without one
  // (fonts loading, the HUD or control bar changing height): re-fit whenever the stable box changes.
  useEffect(() => {
    const scale = gameRef.current?.scale;
    if (!box || !scale) return;
    // refresh() reuses the cached parent size; re-measure the parent first.
    scale.getParentBounds();
    scale.refresh();
  }, [box?.w, box?.h]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={frame} data-table-skin={skin} data-table-orientation={orientation ?? undefined} className="h-full w-full overflow-hidden rounded-2xl">
      <div ref={host} style={box ? { width: box.w, height: box.h } : { width: '100%', height: '100%' }} />
    </div>
  );
}
