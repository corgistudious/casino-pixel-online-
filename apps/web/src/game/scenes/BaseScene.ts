import Phaser from 'phaser';
import i18n from '../../i18n';
import { formatChips } from '../../lib/format';
import { DEFAULT_TABLE_SKIN } from '@casino/shared';
import { skinColors, type OvalGeometry, type TableLayout } from '../../cosmetics/tableArt';
import { useSession } from '../../store/session';
import { ensureFelt, ensureFxTextures, ensureLounge, ensureSkinBackground, hasStudioTexture, hdImage, lazyStudioTexture, preloadOverrides } from '../art';
import { RESULT_FX, RESULT_FX_WIDTH, resolveCanvasW, type ResultFx } from '../assetTextures';
import { FELT_BAND_TARGET, studioFelt } from '../../assets/keyo/bindings';

/** The signed-in player's equipped table skin (or the classic table). */
export const viewerTableSkin = () => useSession.getState().user?.tableSkin ?? DEFAULT_TABLE_SKIN;
import { FONT_DISPLAY, FONT_UI, PORTRAIT_H, PORTRAIT_W, RES, WORLD_H, WORLD_W } from '../hd';

export const W = WORLD_W;
export const H = WORLD_H;

import { stackRegions, type Region } from '../regions';
export { stackRegions, type Region, type PlacedRegion } from '../regions';

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

  /**
   * Portrait mode (phones, V7.1), decided by PhaserView before the game boots:
   *  - a scene with portraitRegions() keeps its landscape world and shows slices of it stacked in a
   *    column (one camera per slice: same artwork, same tap targets, bigger betting spots);
   *  - a scene with nativePortrait() = true lays itself out in a 360×640 world (card tables, Blackjack).
   */
  portrait = false;

  /** Slices for the portrait column; null = no region layout. */
  portraitRegions(): Region[] | null {
    return null;
  }

  /** True when the scene draws its own portrait layout. */
  nativePortrait(): boolean {
    return false;
  }

  /** Height of the native portrait world (360 wide). */
  protected portraitHeight(): number {
    return PORTRAIT_H;
  }

  /**
   * Aspect ratio (width / height) of the stage the canvas is fitted into, measured by PhaserView
   * before the game boots (null = unknown). Scenes that override landscapeWidth() use it to lay
   * themselves out in a world as wide as the stage instead of leaving side bands (Sic Bo / Tài Xỉu).
   */
  stageAspect: number | null = null;
  /** CSS px size of that stage (null = unknown), for scenes that adapt to small screens. */
  stageSize: { w: number; h: number } | null = null;

  /** Width of the landscape world; 640 unless a scene adapts it to the stage (layouts/diceBoard.ts). */
  protected landscapeWidth(): number {
    return WORLD_W;
  }

  /** World size the scene lays itself out in. */
  get sw() {
    return this.portrait && this.nativePortrait() ? PORTRAIT_W : this.landscapeWidth();
  }
  get sh() {
    return this.portrait && this.nativePortrait() ? this.portraitHeight() : WORLD_H;
  }
  /** True when the scene is drawing its own portrait layout. */
  get vertical() {
    return this.portrait && this.nativePortrait();
  }

  /** Canvas size in world units (PhaserView multiplies by RES). */
  canvasSize(): { w: number; h: number } {
    const regions = this.portrait ? this.portraitRegions() : null;
    if (regions) return { w: PORTRAIT_W, h: stackRegions(regions).height };
    return { w: this.sw, h: this.sh };
  }

  /** Text is rasterised for the largest zoom it can be shown at (portrait slices zoom in). */
  protected textRes = RES;

  constructor(key: string) {
    super(key);
    this.ready = new Promise((r) => (this.resolveReady = r));
  }

  preload() {
    // This scene's studio textures only (game/assetTextures.ts), plus the studio felt of the viewer's
    // skin when that skin has one; the drawn versions remain the fallback.
    const felt = this.studioFeltSpec();
    preloadOverrides(this, felt ? [{ key: `felt-${felt.id}`, id: felt.id, canvasW: Math.max(this.sw, this.sh) }] : []);
  }

  private studioFeltSpec() {
    const layout = this.tableLayout();
    return layout ? studioFelt(viewerTableSkin(), layout, this.portrait && this.nativePortrait()) : null;
  }

  /** Studio felt image (cover, or its painted oval lined up with the table oval); false if not loaded. */
  private drawStudioFelt(): boolean {
    const felt = this.studioFeltSpec();
    const key = felt ? `felt-${felt.id}` : '';
    if (!felt || !hasStudioTexture(this, key)) return false;
    const img = this.add.image(this.sw / 2, this.sh / 2, key).setDepth(-100);
    const o = this.tableOval();
    if (felt.oval && o) {
      img.setScale((2 * o.rx) / (2 * felt.oval.rx * img.width), (2 * o.ry) / (2 * felt.oval.ry * img.height));
      img.setPosition(o.cx + (0.5 - felt.oval.cx) * img.displayWidth, o.cy + (0.5 - felt.oval.cy) * img.displayHeight);
    } else if (felt.band) {
      const k = ((FELT_BAND_TARGET.bottom - FELT_BAND_TARGET.top) * this.sh) / ((felt.band.bottom - felt.band.top) * img.height);
      img.setScale(Math.max(k, this.sw / img.width)).setOrigin(0.5, 0);
      img.setY(FELT_BAND_TARGET.top * this.sh - felt.band.top * img.displayHeight);
    } else img.setScale(Math.max(this.sw / img.width, this.sh / img.height));
    return true;
  }

  create() {
    const regions = this.portrait ? this.portraitRegions() : null;
    if (regions) {
      // One camera per slice, stacked in the portrait column; input works through every camera.
      const { placed } = stackRegions(regions);
      this.textRes = RES * Math.max(1, ...placed.map((p) => p.zoom));
      placed.forEach((p, i) => {
        const cam = i === 0 ? this.cameras.main : this.cameras.add();
        cam.setViewport(Math.round(p.x * RES), Math.round(p.y * RES), Math.round(p.w * RES), Math.round(p.h * RES));
        cam.setZoom(p.zoom * RES).centerOn(p.region.x + p.region.w / 2, p.region.y + p.region.h / 2);
        cam.setBackgroundColor('#07060f');
      });
    } else {
      this.cameras.main.setZoom(RES).centerOn(this.sw / 2, this.sh / 2);
      this.cameras.main.setBackgroundColor('#07060f');
    }
    ensureFxTextures(this);
    const bg = this.background();
    const layout = this.tableLayout();
    const cx = this.sw / 2;
    const cy = this.sh / 2;
    if (layout && this.drawStudioFelt()) {
      // Studio felt for the viewer's skin (see assets/keyo/bindings.ts studioFelt).
    } else if (layout) {
      // The VIEWER's own table skin (personal cosmetic): never another player's, never room state.
      hdImage(this, cx, cy, ensureSkinBackground(this, viewerTableSkin(), layout, this.tableOval(), this.sw, this.sh)).setDepth(-100);
    } else {
      if (bg === 'felt') ensureFelt(this);
      else ensureLounge(this);
      hdImage(this, cx, cy, bg === 'felt' ? 'bg-felt' : 'bg-lounge').setDepth(-100);
    }
    this.build();
    const onLang = () => this.labels.forEach((l) => l.obj.setText(i18n.t(l.key, l.vars)));
    i18n.on('languageChanged', onLang);
    this.events.once(Phaser.Scenes.Events.DESTROY, () => i18n.off('languageChanged', onLang));
    if (!this.reduceMotion) this.cameras.cameras.forEach((c) => c.fadeIn(350, 7, 6, 15));
    this.resolveReady();
  }

  protected background(): 'felt' | 'lounge' {
    return 'felt';
  }

  /** Table layout drawn by the viewer's table skin; null = no skin (e.g. slots). */
  protected tableLayout(): TableLayout | null {
    return null;
  }

  /** The oval card table's geometry, for the 'oval' layout. */
  protected tableOval(): OvalGeometry | undefined {
    return undefined;
  }

  /** Printed-line colour of the viewer's skin, for markings a scene draws itself. */
  protected skin() {
    return skinColors(viewerTableSkin());
  }

  protected abstract build(): void;

  text(x: number, y: number, str: string, opts: TextOpts = {}) {
    const t = this.add.text(x, y, str, {
      fontFamily: opts.display ? FONT_DISPLAY : FONT_UI,
      fontSize: `${opts.size ?? 12}px`,
      // Canvas labels: 700 by default (bold and readable on the felt); pass `weight` for lighter text.
      fontStyle: String(opts.weight ?? 700),
      color: opts.color ?? '#ffffff',
      ...(opts.shadow ? { shadow: { offsetX: 0, offsetY: 1, color: 'rgba(0,0,0,0.7)', blur: 3, fill: true } } : {}),
    });
    t.setResolution(this.textRes);
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
  /**
   * Studio result effect (fx.*) behind the result text: pops in and fades (reduced motion: a short
   * static fade). Rare effects load on first use; if a file is missing nothing is shown.
   */
  resultFx(kind: ResultFx, x = this.sw / 2, y = this.sh / 2, scale = 1) {
    const key = `fx-${kind}`;
    const show = () => {
      if (!this.sys.isActive()) return;
      const img = hdImage(this, x, y, key, scale).setDepth(97).setAlpha(0);
      const base = img.scale;
      if (this.reduceMotion) {
        this.tweens.add({ targets: img, alpha: { from: 0.95, to: 0 }, delay: 900, duration: 300, onStart: () => img.setAlpha(0.95), onComplete: () => img.destroy() });
        return;
      }
      this.tweens.add({ targets: img, alpha: 1, scale: { from: base * 0.55, to: base }, duration: 320, ease: 'Back.easeOut' });
      this.tweens.add({ targets: img, alpha: 0, scale: base * 1.12, delay: 1200, duration: 450, onComplete: () => img.destroy() });
    };
    if (hasStudioTexture(this, key)) return show();
    const spec = { key, id: RESULT_FX[kind], scenes: [], contentW: RESULT_FX_WIDTH };
    const requested = Date.now();
    // Not loaded yet: fetch it now and show it only if it arrives while the result is still on screen.
    lazyStudioTexture(this, key, spec.id, resolveCanvasW(spec), () => Date.now() - requested < 700 && show());
  }

  celebrate(amount: number, x = this.sw / 2, y = this.sh / 2, big = false, fx: ResultFx = big ? 'big-win' : 'normal-win') {
    this.resultFx(fx, x, y - 6, big ? 1.2 : 1);
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
