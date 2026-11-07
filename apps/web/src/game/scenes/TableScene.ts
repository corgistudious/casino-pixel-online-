import Phaser from 'phaser';
import i18n from '../../i18n';
import { compactChips } from '../../lib/format';
import { CHIP_STYLES, chipDenomFor, ensureChipTextures, hdScale } from '../art';
import { BaseScene } from './BaseScene';

export interface Spot {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  highlight: Phaser.GameObjects.Rectangle;
  /** The spot's printed name / number (kept so a bet marker can stay clear of it). */
  labelObj?: Phaser.GameObjects.Text;
}

/** Spots narrower than this show a compact bet badge at their top edge instead of a chip stack. */
export const NARROW_SPOT = 50;

const LINE = 0xf2d38a;

/** Scene with a betting layout printed on the felt: spots emit 'spot' events and show chip stacks. */
export abstract class TableScene extends BaseScene {
  protected spots = new Map<string, Spot>();
  private stacks = new Map<string, Phaser.GameObjects.Container>();
  interactive = true;

  override create() {
    ensureChipTextures(this);
    super.create();
  }

  /** Tài Xỉu, Sic Bo and Roulette: framed felt behind the bowl/wheel and the betting board. */
  protected override tableLayout() {
    return 'board' as const;
  }

  protected addSpot(
    key: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fill: number | null,
    labelKeyOrText: string,
    opts: { translate?: boolean; size?: number; color?: string; sub?: string; display?: boolean } = {},
  ) {
    const g = this.add.graphics();
    if (fill !== null) {
      g.fillStyle(fill, 0.92).fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
      g.fillStyle(0xffffff, 0.08).fillRect(x + 1.5, y + 1.5, w - 3, (h - 3) * 0.45);
    }
    g.lineStyle(1, LINE, 0.85).strokeRect(x, y, w, h);
    const cx = x + w / 2;
    const cy = y + h / 2 - (opts.sub ? 5 : 0);
    const textOpts = { size: opts.size ?? 12, color: opts.color ?? '#ffffff', display: opts.display, shadow: true };
    let labelObj: Phaser.GameObjects.Text | undefined;
    if (labelKeyOrText) labelObj = opts.translate ? this.label(cx, cy, labelKeyOrText, textOpts) : this.text(cx, cy, labelKeyOrText, textOpts);
    if (opts.sub) this.text(cx, y + h - 7, opts.sub, { size: 7, color: '#f7e2a8', weight: 500 });

    const highlight = this.add
      .rectangle(cx, y + h / 2, w - 2, h - 2, 0xffe08a, 0)
      .setStrokeStyle(1.5, 0xffe08a, 0)
      .setBlendMode(Phaser.BlendModes.ADD);
    const zone = this.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => {
      if (this.interactive) this.events.emit('spot', key);
    });
    zone.on('pointerover', () => this.interactive && highlight.setFillStyle(0xffffff, 0.1));
    zone.on('pointerout', () => highlight.setFillStyle(0xffe08a, 0));
    this.spots.set(key, { key, x, y, w, h, highlight, labelObj });
  }

  setBets(bets: Record<string, number>) {
    for (const [key, stack] of this.stacks) {
      if (!bets[key]) {
        this.removeStack(stack);
        this.stacks.delete(key);
      }
    }
    for (const [key, amount] of Object.entries(bets)) {
      const spot = this.spots.get(key);
      if (!spot || amount <= 0) continue;
      const prev = this.stacks.get(key);
      prev?.destroy();
      const tex = `chip-${chipDenomFor(amount)}`;
      let c: Phaser.GameObjects.Container;
      if (spot.w > NARROW_SPOT) {
        // Wide spots keep their label readable by stacking chips at the right edge.
        c = this.add.container(spot.x + spot.w - 13, spot.y + spot.h / 2 + 4).setDepth(20);
        const layers = Math.min(5, Math.ceil(Math.log10(amount + 1)));
        for (let i = 0; i < layers; i++) c.add(this.add.image(0, -i * 1.6, tex).setScale(hdScale(tex, 0.55)));
        c.add(this.text(0, -layers * 1.6 - 11, compactChips(amount), { size: 8, shadow: true, weight: 700 }));
      } else {
        // Narrow spots (Sic Bo totals 4–17, roulette numbers): a compact badge — mini chip + amount —
        // just inside the top edge, so the number and the payout under it stay readable.
        c = this.add.container(spot.x + spot.w / 2, spot.y + 6).setDepth(20);
        const label = this.text(0, 0, compactChips(amount), { size: 7, shadow: false, weight: 800 });
        const chipD = 8;
        const width = Math.min(spot.w - 2, label.width + chipD + 5);
        const style = CHIP_STYLES[chipDenomFor(amount)]!;
        const pill = this.add.graphics();
        pill.fillStyle(0x0b0620, 0.88).fillRoundedRect(-width / 2, -5, width, 10, 5);
        pill.lineStyle(0.8, Phaser.Display.Color.HexStringToColor(style.base).color, 1).strokeRoundedRect(-width / 2, -5, width, 10, 5);
        const chip = this.add.image(-width / 2 + chipD / 2 + 1, 0, tex).setScale(hdScale(tex, chipD / 32));
        label.setPosition(-width / 2 + chipD + 2 + (width - chipD - 3) / 2, 0.3).setColor('#ffe9a8');
        // Shrink the amount if a very narrow spot cannot hold it at full size.
        const room = width - chipD - 4;
        if (label.width > room) label.setScale((label.scaleX * room) / label.width);
        c.add([pill, chip, label]);
      }
      // Newly placed chips drop in; existing stacks just update.
      if (!prev && !this.reduceMotion) this.tweens.add({ targets: c, y: { from: c.y - 14, to: c.y }, alpha: { from: 0, to: 1 }, duration: 180, ease: 'Quad.easeOut' });
      this.stacks.set(key, c);
    }
  }

  private removeStack(stack: Phaser.GameObjects.Container) {
    if (this.reduceMotion) return stack.destroy();
    this.tweens.add({ targets: stack, alpha: 0, y: stack.y - 10, duration: 200, onComplete: () => stack.destroy() });
  }

  /** Bet markers and spot labels in world units (QA / regression tests: markers never cover labels). */
  markerRects(): { key: string; marker: { x: number; y: number; w: number; h: number }; label: { x: number; y: number; w: number; h: number } | null }[] {
    const box = (b: Phaser.Geom.Rectangle) => ({ x: b.x, y: b.y, w: b.width, h: b.height });
    return [...this.stacks.entries()].map(([key, c]) => ({ key, marker: box(c.getBounds()), label: this.spots.get(key)?.labelObj ? box(this.spots.get(key)!.labelObj!.getBounds()) : null }));
  }

  highlightSpots(keys: string[]) {
    for (const spot of this.spots.values()) spot.highlight.setStrokeStyle(1.5, 0xffe08a, keys.includes(spot.key) ? 1 : 0);
    const targets = keys.map((k) => this.spots.get(k)?.highlight).filter(Boolean);
    targets.forEach((h) => h!.setFillStyle(0xffe08a, 0.18));
    // Winning stacks get a gold halo (V7.1 2.5D chip win state).
    if (!this.reduceMotion) {
      for (const k of keys) {
        const stack = this.stacks.get(k);
        if (!stack) continue;
        const glow = this.add.image(stack.x, stack.y - 2, 'chip-glow').setScale(hdScale('chip-glow', 0.9)).setDepth(19).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: glow, alpha: { from: 1, to: 0 }, scale: hdScale('chip-glow', 1.3), duration: 1300, onComplete: () => glow.destroy() });
      }
    }
    if (targets.length && !this.reduceMotion) this.tweens.add({ targets, alpha: { from: 1, to: 0.35 }, yoyo: true, repeat: 3, duration: 220 });
    if (!keys.length) for (const spot of this.spots.values()) spot.highlight.setFillStyle(0xffe08a, 0).setAlpha(1);
  }

  protected t(key: string, vars?: Record<string, unknown>) {
    return i18n.t(key, vars);
  }
}
