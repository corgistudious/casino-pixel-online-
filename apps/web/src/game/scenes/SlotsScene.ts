import Phaser from 'phaser';
import { SLOT_PAYLINES, SLOT_ROWS, SLOT_SYMBOLS, type SlotSymbol, type SlotsResult } from '@casino/shared';
import { sfx } from '../../audio/sfx';
import { ensureSlotCabinet, ensureSlotTextures, hdImage, hdScale } from '../art';
import { BaseScene, H, W } from './BaseScene';

const CELL = 58;
const REELS = 5;
const X0 = W / 2 - (REELS * CELL) / 2;
const Y0 = 92;
const LINE_COLORS = [0xffd86b, 0xff4fd8, 0x5ad8ff, 0x5ef2a0, 0xff8a3d, 0xb18cff, 0xff3b5c, 0x9dff3b, 0x3d8bff, 0xffffff];

export class SlotsScene extends BaseScene {
  static readonly KEY = 'slots';
  private reels: Phaser.GameObjects.Container[] = [];
  private grid: SlotSymbol[][] = [];
  private lineLayer!: Phaser.GameObjects.Graphics;

  constructor() {
    super(SlotsScene.KEY);
  }

  protected override background() {
    return 'lounge' as const;
  }

  protected build() {
    ensureSlotTextures(this);
    const cw = REELS * CELL + 56;
    const ch = SLOT_ROWS * CELL + 104;
    ensureSlotCabinet(this, cw, ch);
    hdImage(this, W / 2, Y0 - 52 + ch / 2, 'slots-cabinet');

    this.text(W / 2, Y0 - 28, 'ROYAL SLOTS', { size: 24, display: true, color: '#ffe08a', shadow: true }).setStroke('#6b4708', 2);
    this.drawMarquee(cw);

    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.5).fillRoundedRect(X0 - 5, Y0 - 5, REELS * CELL + 10, SLOT_ROWS * CELL + 10, 8);
    for (let r = 0; r < REELS; r++) {
      g.fillGradientStyle(0xd9d2ea, 0xd9d2ea, 0xffffff, 0xffffff, 1);
      g.fillRect(X0 + r * CELL + 1, Y0, CELL - 2, (SLOT_ROWS * CELL) / 2);
      g.fillGradientStyle(0xffffff, 0xffffff, 0xd9d2ea, 0xd9d2ea, 1);
      g.fillRect(X0 + r * CELL + 1, Y0 + (SLOT_ROWS * CELL) / 2, CELL - 2, (SLOT_ROWS * CELL) / 2);
    }
    SLOT_PAYLINES.forEach((rows, i) => {
      const y = Y0 + rows[0]! * CELL + CELL / 2 + (i > 2 ? (i % 2 ? -9 : 9) : 0);
      g.fillStyle(LINE_COLORS[i]!, 1).fillCircle(X0 - 13, y, 3);
      g.fillStyle(LINE_COLORS[i]!, 1).fillCircle(X0 + REELS * CELL + 13, Y0 + rows[REELS - 1]! * CELL + CELL / 2 + (i > 2 ? (i % 2 ? -9 : 9) : 0), 3);
    });

    const mask = this.make.graphics({}, false).fillRect(X0, Y0, REELS * CELL, SLOT_ROWS * CELL).createGeometryMask();
    for (let r = 0; r < REELS; r++) {
      const column = Array.from({ length: SLOT_ROWS }, () => Phaser.Utils.Array.GetRandom([...SLOT_SYMBOLS]) as SlotSymbol);
      this.grid.push(column);
      const container = this.add.container(X0 + r * CELL, Y0);
      container.setMask(mask);
      this.reels.push(container);
      this.fillReel(r, column);
    }
    // Glass shading over the reels.
    const glass = this.add.graphics().setDepth(5);
    glass.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.35, 0.35, 0, 0).fillRect(X0, Y0, REELS * CELL, 22);
    glass.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.35, 0.35).fillRect(X0, Y0 + SLOT_ROWS * CELL - 22, REELS * CELL, 22);
    this.lineLayer = this.add.graphics().setDepth(10);
  }

  private drawMarquee(width: number) {
    const count = 18;
    for (let i = 0; i < count; i++) {
      const x = W / 2 - width / 2 + 24 + i * ((width - 48) / (count - 1));
      for (const y of [Y0 - 44, Y0 + SLOT_ROWS * CELL + 30]) {
        const bulb = this.add.circle(x, y, 2, 0xffe08a).setBlendMode(Phaser.BlendModes.ADD);
        if (!this.reduceMotion) this.tweens.add({ targets: bulb, alpha: 0.25, yoyo: true, repeat: -1, duration: 500, delay: (i % 3) * 170 });
      }
    }
  }

  private symbolImage(symbol: SlotSymbol, row: number) {
    const key = `slot-${symbol}`;
    return this.add.image(CELL / 2, row * CELL + CELL / 2, key).setScale(hdScale(key));
  }

  private fillReel(reel: number, symbols: SlotSymbol[]) {
    const c = this.reels[reel]!;
    c.removeAll(true);
    c.y = Y0;
    symbols.forEach((s, row) => c.add(this.symbolImage(s, row)));
  }

  async spin(result: SlotsResult): Promise<void> {
    this.lineLayer.clear();
    const tasks = this.reels.map((container, r) => {
      const final = result.grid[r]!;
      if (this.reduceMotion) {
        this.fillReel(r, final);
        return Promise.resolve();
      }
      // Strip: final symbols on top, random filler, then the currently visible symbols at the bottom.
      const filler = Array.from({ length: 12 + r * 4 }, () => Phaser.Utils.Array.GetRandom([...SLOT_SYMBOLS]) as SlotSymbol);
      const strip = [...final, ...filler, ...this.grid[r]!];
      container.removeAll(true);
      strip.forEach((s, row) => container.add(this.symbolImage(s, row)));
      container.y = Y0 - (strip.length - SLOT_ROWS) * CELL;
      let lastTick = 0;
      return this.tweenP({
        targets: container,
        y: Y0,
        duration: 900 + r * 280,
        ease: 'Back.easeOut',
        easeParams: [0.8],
        onUpdate: (tw) => {
          if (tw.progress - lastTick > 0.08) {
            lastTick = tw.progress;
            sfx.tick();
          }
        },
      }).then(() => {
        sfx.stop();
        this.fillReel(r, final);
      });
    });
    await Promise.all(tasks);
    this.grid = result.grid.map((col) => col.slice());
    if (result.wins.length > 0) await this.showWins(result);
  }

  private async showWins(result: SlotsResult) {
    const cells = new Set<string>();
    for (const win of result.wins) {
      const rows = SLOT_PAYLINES[win.line]!;
      this.lineLayer.lineStyle(5, LINE_COLORS[win.line]!, 0.25);
      this.strokeLine(rows);
      this.lineLayer.lineStyle(2, LINE_COLORS[win.line]!, 1);
      this.strokeLine(rows);
      for (let r = 0; r < win.count; r++) cells.add(`${r}:${rows[r]}`);
    }
    if (!this.reduceMotion) {
      for (const key of cells) {
        const [r, row] = key.split(':').map(Number) as [number, number];
        const img = this.reels[r]!.list[row] as Phaser.GameObjects.Image | undefined;
        if (!img) continue;
        this.tweens.add({ targets: img, scale: img.scale * 1.18, yoyo: true, repeat: 2, duration: 200, ease: 'Sine.easeInOut' });
        const glow = hdImage(this, X0 + r * CELL + CELL / 2, Y0 + row * CELL + CELL / 2, 'fx-glow', 3)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(4)
          .setAlpha(0.7);
        this.tweens.add({ targets: glow, alpha: 0, duration: 1400, onComplete: () => glow.destroy() });
      }
    }
    const big = result.totalMultiplier >= 100;
    big ? sfx.bigWin() : sfx.win();
    this.celebrate(result.payout, W / 2, H / 2, big);
    await this.wait(this.reduceMotion ? 300 : 1000);
  }

  private strokeLine(rows: readonly number[]) {
    this.lineLayer.beginPath();
    rows.forEach((row, r) => {
      const x = X0 + r * CELL + CELL / 2;
      const y = Y0 + row * CELL + CELL / 2;
      if (r === 0) this.lineLayer.moveTo(x - CELL / 2, y);
      this.lineLayer.lineTo(x, y);
      if (r === rows.length - 1) this.lineLayer.lineTo(x + CELL / 2, y);
    });
    this.lineLayer.strokePath();
  }
}
