import Phaser from 'phaser';
import i18n from '../../i18n';
import { formatChips } from '../../lib/format';
import { ensureFelt, ensureFxTextures, ensureLounge, hdImage, preloadOverrides } from '../art';
import { FONT_DISPLAY, FONT_UI, RES, WORLD_H, WORLD_W } from '../hd';

export const W = WORLD_W;
export const H = WORLD_H;

export interface TextOpts {
  size?: number;
  color?: string;
  originX?: number;
  originY?: number;
  shadow?: boolean;
  display?: boolean;
  weight?: number;
}

/** Common helpers for all table scenes: HD text, translated labels, celebrations, promise tweens. */
export abstract class BaseScene extends Phaser.Scene {
  reduceMotion = false;
  readonly ready: Promise<void>;
  private resolveReady!: () => void;
  private labels: { obj: Phaser.GameObjects.Text; key: string; vars?: Record<string, unknown> }[] = [];

  constructor(key: string) {
    super(key);
    this.ready = new Promise((r) => (this.resolveReady = r));
  }

  preload() {
    preloadOverrides(this);
  }

  create() {
    this.cameras.main.setZoom(RES).centerOn(W / 2, H / 2);
    this.cameras.main.setBackgroundColor('#07060f');
    ensureFxTextures(this);
    const bg = this.background();
    if (bg === 'felt') ensureFelt(this);
    else ensureLounge(this);
    hdImage(this, W / 2, H / 2, bg === 'felt' ? 'bg-felt' : 'bg-lounge').setDepth(-100);
    this.build();
    const onLang = () => this.labels.forEach((l) => l.obj.setText(i18n.t(l.key, l.vars)));
    i18n.on('languageChanged', onLang);
    this.events.once(Phaser.Scenes.Events.DESTROY, () => i18n.off('languageChanged', onLang));
    if (!this.reduceMotion) this.cameras.main.fadeIn(350, 7, 6, 15);
    this.resolveReady();
  }

  protected background(): 'felt' | 'lounge' {
    return 'felt';
  }

  protected abstract build(): void;

  text(x: number, y: number, str: string, opts: TextOpts = {}) {
    const t = this.add.text(x, y, str, {
      fontFamily: opts.display ? FONT_DISPLAY : FONT_UI,
      fontSize: `${opts.size ?? 12}px`,
      fontStyle: String(opts.weight ?? (opts.display ? 700 : 600)),
      color: opts.color ?? '#ffffff',
      ...(opts.shadow ? { shadow: { offsetX: 0, offsetY: 1, color: 'rgba(0,0,0,0.7)', blur: 3, fill: true } } : {}),
    });
    t.setResolution(RES);
    t.setOrigin(opts.originX ?? 0.5, opts.originY ?? 0.5);
    return t;
  }

  /** Text bound to a translation key; re-rendered when the language changes. */
  label(x: number, y: number, key: string, opts: TextOpts = {}, vars?: Record<string, unknown>) {
    const obj = this.text(x, y, i18n.t(key, vars), opts);
    this.labels.push({ obj, key, vars });
    return obj;
  }

  wait(ms: number): Promise<void> {
    return new Promise((r) => this.time.delayedCall(ms, () => r()));
  }

  tweenP(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.add({ ...config, onComplete: () => resolve() });
    });
  }

  /** Light burst, coin shower, sparkles and a floating win amount. */
  celebrate(amount: number, x = W / 2, y = H / 2, big = false) {
    const label = this.text(x, y, `+${formatChips(amount, i18n.language)}`, {
      size: big ? 40 : 28,
      color: '#ffe08a',
      display: true,
      shadow: true,
    }).setDepth(100);
    label.setStroke('#5a3a06', 3);
    this.tweens.add({ targets: label, scale: { from: 0.4, to: 1 }, duration: 380, ease: 'Back.easeOut' });
    this.tweens.add({ targets: label, y: y - 26, alpha: { from: 1, to: 0 }, duration: 1600, delay: 1100, onComplete: () => label.destroy() });
    if (this.reduceMotion) return;

    const glow = hdImage(this, x, y, 'fx-glow', 1).setDepth(98).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.9, to: 0 },
      scale: { from: glow.scale * 2, to: glow.scale * (big ? 14 : 9) },
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => glow.destroy(),
    });
    const coinScale = 1 / RES;
    const coins = this.add.particles(x, y, 'fx-coin', {
      speed: { min: 90, max: big ? 280 : 180 },
      angle: { min: 200, max: 340 },
      gravityY: 420,
      lifespan: 1500,
      rotate: { min: 0, max: 360 },
      scale: { start: coinScale * 1.2, end: coinScale * 0.8 },
      emitting: false,
    });
    coins.setDepth(99);
    coins.explode(big ? 48 : 18);
    const sparks = this.add.particles(x, y, 'fx-spark', {
      speed: { min: 20, max: 120 },
      lifespan: 900,
      scale: { start: coinScale * 1.4, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    sparks.setDepth(99);
    sparks.explode(big ? 30 : 12);
    this.time.delayedCall(1800, () => {
      coins.destroy();
      sparks.destroy();
    });
  }
}
