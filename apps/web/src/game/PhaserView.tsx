import Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import { useSettings } from '../store/settings';
import { RES, WORLD_H, WORLD_W } from './hd';
import type { BaseScene } from './scenes/BaseScene';

/** Mounts a Phaser game running a single scene and hands the scene to React once it is ready. */
export function PhaserView<S extends BaseScene>({ create, onReady }: { create: () => S; onReady: (scene: S) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    if (!host.current) return;
    const scene = create();
    scene.reduceMotion = useSettings.getState().reduceMotion;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: WORLD_W * RES,
      height: WORLD_H * RES,
      backgroundColor: '#07060f',
      antialias: true,
      pixelArt: false,
      roundPixels: false,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      audio: { noAudio: true },
      banner: false,
      scene,
    });
    let alive = true;
    void scene.ready.then(() => alive && readyRef.current(scene));
    return () => {
      alive = false;
      game.destroy(true);
    };
    // The scene factory is stable per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="h-full w-full overflow-hidden rounded-2xl" />;
}
