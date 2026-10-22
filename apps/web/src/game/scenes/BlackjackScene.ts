import Phaser from 'phaser';
import type { BlackjackView, Card } from '@casino/shared';
import { sfx } from '../../audio/sfx';
import { compactChips } from '../../lib/format';
import { cardKey, chipDenomFor, ensureCardTexture, ensureChipTextures, ensureShoeTexture, hdImage, hdScale } from '../art';
import { BaseScene, H, W } from './BaseScene';

const SHOE = { x: 566, y: 74 };
const DEALER_Y = 112;
const PLAYER_Y = 252;
const SPACING = 30;
const CARD_SCALE = 1;

interface Slot {
  img: Phaser.GameObjects.Image;
  card: Card | null;
}

export class BlackjackScene extends BaseScene {
  static readonly KEY = 'blackjack';
  private dealer: Slot[] = [];
  private player: Slot[] = [];
  private dealerTotal!: Phaser.GameObjects.Text;
  private playerTotal!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private betStack!: Phaser.GameObjects.Container;

  constructor() {
    super(BlackjackScene.KEY);
  }

  protected build() {
    ensureChipTextures(this);
    ensureCardTexture(this, null);
    ensureShoeTexture(this);
    const g = this.add.graphics();
    // Printed table markings: gold arcs and the insurance-style rule line.
    g.lineStyle(1.2, 0xf2d38a, 0.8).strokeEllipse(W / 2, 20, 560, 420);
    g.lineStyle(0.8, 0xf2d38a, 0.45).strokeEllipse(W / 2, 20, 600, 470);
    // Padded leather rail along the bottom edge
    g.fillGradientStyle(0x3a1d0b, 0x3a1d0b, 0x170a03, 0x170a03, 1).fillRect(0, H - 14, W, 14);
    g.fillStyle(0xf2c14e, 1).fillRect(0, H - 14, W, 1);

    hdImage(this, SHOE.x, SHOE.y, 'card-shoe');
    hdImage(this, SHOE.x - 4, SHOE.y - 4, 'card-back', 0.8).setAngle(-12);

    this.label(W / 2, 44, 'blackjack.rules', { size: 9, color: '#cdeedd', weight: 500 });
    this.label(W / 2 - 150, DEALER_Y - 10, 'blackjack.dealer', { size: 13, display: true, color: '#f7e2a8' });
    this.label(W / 2 - 150, PLAYER_Y - 10, 'blackjack.player', { size: 13, display: true, color: '#f7e2a8' });
    this.dealerTotal = this.text(W / 2 - 150, DEALER_Y + 10, '', { size: 16, weight: 800, shadow: true });
    this.playerTotal = this.text(W / 2 - 150, PLAYER_Y + 10, '', { size: 16, weight: 800, shadow: true });
    this.banner = this.text(W / 2, 182, '', { size: 30, display: true, color: '#ffe08a', shadow: true }).setDepth(50);
    this.banner.setStroke('#5a3a06', 3);

    // Betting circle
    g.lineStyle(1.2, 0xf2d38a, 0.9).strokeCircle(W / 2, 318, 17);
    g.lineStyle(0.6, 0xf2d38a, 0.5).strokeCircle(W / 2, 318, 20);
    this.betStack = this.add.container(W / 2, 318);
  }

  reset() {
    [...this.dealer, ...this.player].forEach((s) => s.img.destroy());
    this.dealer = [];
    this.player = [];
    this.dealerTotal.setText('');
    this.playerTotal.setText('');
    this.banner.setText('');
  }

  setBet(amount: number) {
    this.betStack.removeAll(true);
    if (amount <= 0) return;
    const layers = Math.min(5, Math.ceil(Math.log10(amount + 1)));
    const tex = `chip-${chipDenomFor(amount)}`;
    for (let i = 0; i < layers; i++) this.betStack.add(this.add.image(0, -i * 2, tex).setScale(hdScale(tex, 0.75)));
    this.betStack.add(this.text(0, -layers * 2 - 15, compactChips(amount), { size: 10, weight: 700, shadow: true }));
  }

  private x(i: number, n: number) {
    return W / 2 - ((n - 1) * SPACING) / 2 + i * SPACING;
  }

  private async layout(row: Slot[], y: number) {
    const n = row.length;
    await Promise.all(
      row.map((s, i) =>
        this.reduceMotion
          ? (s.img.setPosition(this.x(i, n), y), Promise.resolve())
          : this.tweenP({ targets: s.img, x: this.x(i, n), y, duration: 160 }),
      ),
    );
  }

  private async deal(row: Slot[], card: Card | null, y: number) {
    ensureCardTexture(this, card);
    const img = hdImage(this, SHOE.x, SHOE.y, cardKey(card), CARD_SCALE).setDepth(10 + row.length);
    row.push({ img, card });
    sfx.card();
    if (this.reduceMotion) {
      await this.layout(row, y);
      return;
    }
    // Move existing cards and fly the new one in together.
    const n = row.length;
    await Promise.all([
      ...row.slice(0, -1).map((s, i) => this.tweenP({ targets: s.img, x: this.x(i, n), duration: 160 })),
      this.tweenP({ targets: img, x: this.x(n - 1, n), y, angle: { from: -20, to: 0 }, duration: 260, ease: 'Quad.easeOut' }),
    ]);
  }

  private async flip(slot: Slot, card: Card) {
    ensureCardTexture(this, card);
    slot.card = card;
    if (this.reduceMotion) {
      slot.img.setTexture(cardKey(card));
      return;
    }
    await this.tweenP({ targets: slot.img, scaleX: 0, duration: 110 });
    slot.img.setTexture(cardKey(card));
    sfx.card();
    await this.tweenP({ targets: slot.img, scaleX: hdScale(cardKey(card), CARD_SCALE), duration: 110 });
  }

  /** Animates the table from what is displayed to the given view. */
  async show(view: BlackjackView, t: (key: string) => string): Promise<void> {
    if (view.player.length < this.player.length) this.reset();
    this.setBet(view.bet * (view.doubled ? 2 : 1));
    this.banner.setText('');

    const fresh = this.player.length === 0 && this.dealer.length === 0;
    if (fresh) {
      // Deal order: player, dealer, player, dealer.
      for (let i = 0; i < 2; i++) {
        if (view.player[i]) await this.deal(this.player, view.player[i]!, PLAYER_Y);
        if (i < view.dealer.length) await this.deal(this.dealer, i === 1 ? null : view.dealer[i]!, DEALER_Y);
      }
    }
    for (let i = this.player.length; i < view.player.length; i++) await this.deal(this.player, view.player[i]!, PLAYER_Y);
    this.playerTotal.setText(String(view.playerTotal));

    for (let i = 0; i < view.dealer.length; i++) {
      const card = view.dealer[i] ?? null;
      const slot = this.dealer[i];
      if (!slot) {
        if (!this.reduceMotion) await this.wait(220);
        await this.deal(this.dealer, card, DEALER_Y);
      } else if (slot.card === null && card) await this.flip(slot, card);
    }
    await this.layout(this.dealer, DEALER_Y);
    this.dealerTotal.setText(view.dealerTotal === null ? '?' : String(view.dealerTotal));

    if (view.phase === 'finished' && view.outcome) {
      this.banner.setText(t(`blackjack.outcomes.${view.outcome}`));
      if (!this.reduceMotion) this.tweens.add({ targets: this.banner, scale: { from: 0.5, to: 1 }, duration: 250, ease: 'Back.easeOut' });
      if (view.payout > view.bet * (view.doubled ? 2 : 1)) {
        view.outcome === 'blackjack' ? sfx.bigWin() : sfx.win();
        this.celebrate(view.payout, W / 2, PLAYER_Y);
      } else if (view.payout === 0) sfx.lose();
    }
  }
}
