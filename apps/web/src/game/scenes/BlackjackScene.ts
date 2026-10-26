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
/** Room for the player's hands across the felt (split hands share it). */
const HANDS_WIDTH = 520;

interface Slot {
  img: Phaser.GameObjects.Image;
  card: Card | null;
}

export class BlackjackScene extends BaseScene {
  static readonly KEY = 'blackjack';
  private dealer: Slot[] = [];
  /** Player cards on the felt; each slot remembers which hand and position it shows. */
  private player: (Slot & { hand: number; index: number })[] = [];
  private dealerTotal!: Phaser.GameObjects.Text;
  private playerTotal!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private betStack!: Phaser.GameObjects.Container;
  /** Per-hand totals, results and the active-hand marker (rebuilt on every update). */
  private handLayer!: Phaser.GameObjects.Container;

  constructor() {
    super(BlackjackScene.KEY);
  }

  protected build() {
    ensureChipTextures(this);
    ensureCardTexture(this, null);
    ensureShoeTexture(this);
    const g = this.add.graphics();
    // Printed table markings: gold arcs.
    g.lineStyle(1.2, 0xf2d38a, 0.8).strokeEllipse(W / 2, 20, 560, 420);
    g.lineStyle(0.8, 0xf2d38a, 0.45).strokeEllipse(W / 2, 20, 600, 470);
    // Padded leather rail along the bottom edge
    g.fillGradientStyle(0x3a1d0b, 0x3a1d0b, 0x170a03, 0x170a03, 1).fillRect(0, H - 14, W, 14);
    g.fillStyle(0xf2c14e, 1).fillRect(0, H - 14, W, 1);

    hdImage(this, SHOE.x, SHOE.y, 'card-shoe');
    hdImage(this, SHOE.x - 4, SHOE.y - 4, 'card-back', 0.8).setAngle(-12);

    this.label(W / 2, 44, 'blackjack.rules', { size: 9, color: '#cdeedd', weight: 500 });
    this.label(W / 2 - 150, DEALER_Y - 10, 'blackjack.dealer', { size: 13, display: true, color: '#f7e2a8' });
    this.label(52, PLAYER_Y - 10, 'blackjack.player', { size: 13, display: true, color: '#f7e2a8' });
    this.dealerTotal = this.text(W / 2 - 150, DEALER_Y + 10, '', { size: 16, weight: 800, shadow: true });
    this.playerTotal = this.text(52, PLAYER_Y + 10, '', { size: 16, weight: 800, shadow: true });
    this.handLayer = this.add.container(0, 0).setDepth(30);
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
    this.handLayer.removeAll(true);
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

  /** Where card `index` of hand `hand` sits when `hands` hands are on the felt. */
  private spot(hand: number, hands: number, index: number, cards: number) {
    const gap = hands > 1 ? Math.min(150, HANDS_WIDTH / hands) : 0;
    const center = W / 2 + (hand - (hands - 1) / 2) * gap;
    const step = hands > 2 ? 16 : hands > 1 ? 22 : SPACING;
    return { x: center - ((cards - 1) * step) / 2 + index * step, y: PLAYER_Y, center, scale: hands > 2 ? 0.82 : CARD_SCALE };
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

  /**
   * Brings the player's cards to the view: cards already on the felt slide to their (new) hand —
   * after a split the pair moves apart — and missing cards fly in from the shoe.
   */
  private async showPlayer(view: BlackjackView) {
    const n = view.hands.length;
    const free = this.player.slice();
    const next: typeof this.player = [];
    const deals: { hand: number; index: number; card: Card }[] = [];
    view.hands.forEach((h, hand) =>
      h.cards.forEach((card, index) => {
        const reuse = free.findIndex((s) => s.card === card && s.hand <= hand);
        if (reuse >= 0) next.push({ ...free.splice(reuse, 1)[0]!, hand, index });
        else deals.push({ hand, index, card });
      }),
    );
    free.forEach((s) => s.img.destroy());
    const target = (hand: number, index: number) => this.spot(hand, n, index, view.hands[hand]!.cards.length);
    await Promise.all(
      next.map((s) => {
        const p = target(s.hand, s.index);
        const scale = hdScale(cardKey(s.card), p.scale);
        s.img.setDepth(10 + s.hand * 10 + s.index);
        return this.reduceMotion ? (s.img.setPosition(p.x, p.y).setScale(scale), Promise.resolve()) : this.tweenP({ targets: s.img, x: p.x, y: p.y, scale, duration: 200 });
      }),
    );
    this.player = next;
    for (const d of deals) {
      const p = target(d.hand, d.index);
      ensureCardTexture(this, d.card);
      const img = hdImage(this, SHOE.x, SHOE.y, cardKey(d.card), p.scale).setDepth(10 + d.hand * 10 + d.index);
      this.player.push({ img, card: d.card, hand: d.hand, index: d.index });
      sfx.card();
      if (this.reduceMotion) img.setPosition(p.x, p.y);
      else await this.tweenP({ targets: img, x: p.x, y: p.y, angle: { from: -20, to: 0 }, duration: 240, ease: 'Quad.easeOut' });
    }
  }

  /** Totals, active-hand marker and per-hand results for split rounds. */
  private drawHands(view: BlackjackView, t: (key: string) => string) {
    this.handLayer.removeAll(true);
    const n = view.hands.length;
    if (n === 1) {
      this.playerTotal.setText(String(view.playerTotal));
      return;
    }
    this.playerTotal.setText('');
    view.hands.forEach((h, i) => {
      const { center } = this.spot(i, n, 0, h.cards.length);
      const active = view.phase === 'player' && i === view.active;
      if (active) {
        const glow = this.add.graphics();
        glow.lineStyle(2, 0xffe08a, 0.95).strokeRoundedRect(center - 62, PLAYER_Y - 44, 124, 90, 10);
        this.handLayer.add(glow);
        if (!this.reduceMotion) this.tweens.add({ targets: glow, alpha: { from: 1, to: 0.45 }, duration: 700, yoyo: true, repeat: -1 });
      }
      const total = h.total > 21 ? `${h.total} ✕` : String(h.total);
      this.handLayer.add(this.text(center, PLAYER_Y - 54, `${t('blackjack.hand').replace('{{n}}', String(i + 1))} · ${total}`, { size: 10, weight: 800, shadow: true, color: active ? '#ffe08a' : '#ffffff' }));
      this.handLayer.add(this.text(center, PLAYER_Y + 52, `${compactChips(h.bet * (h.doubled ? 2 : 1))}${h.doubled ? ' ×2' : ''}`, { size: 9, weight: 700, shadow: true, color: '#cdeedd' }));
      if (view.phase === 'finished' && h.outcome) {
        const won = h.payout > h.bet * (h.doubled ? 2 : 1);
        const color = won ? '#7ff0a8' : h.payout === 0 ? '#ff9fae' : '#fff1b8';
        this.handLayer.add(this.text(center, PLAYER_Y + 66, t(`blackjack.outcomes.${h.outcome}`), { size: 11, display: true, shadow: true, color }));
      }
    });
  }

  /** Animates the table from what is displayed to the given view. */
  async show(view: BlackjackView, t: (key: string) => string): Promise<void> {
    const hands = view.hands ?? [{ cards: view.player, total: view.playerTotal, soft: false, bet: view.bet, doubled: view.doubled, done: false, outcome: view.outcome, payout: view.payout }];
    const v = { ...view, hands };
    const shown = this.player.length;
    const wanted = hands.reduce((a, h) => a + h.cards.length, 0);
    if (wanted < shown || (shown > 0 && this.player.every((s) => !hands.some((h) => h.cards.includes(s.card!))))) this.reset();
    this.setBet(view.bet);
    this.banner.setText('');

    const fresh = this.player.length === 0 && this.dealer.length === 0;
    if (fresh && hands.length === 1) {
      // Deal order: player, dealer, player, dealer.
      const first = hands[0]!.cards;
      for (let i = 0; i < 2; i++) {
        if (first[i]) {
          const p = this.spot(0, 1, i, 2);
          ensureCardTexture(this, first[i]!);
          const img = hdImage(this, SHOE.x, SHOE.y, cardKey(first[i]!), CARD_SCALE).setDepth(10 + i);
          this.player.push({ img, card: first[i]!, hand: 0, index: i });
          sfx.card();
          if (this.reduceMotion) img.setPosition(p.x, p.y);
          else await this.tweenP({ targets: img, x: p.x, y: p.y, angle: { from: -20, to: 0 }, duration: 260, ease: 'Quad.easeOut' });
        }
        if (i < view.dealer.length) await this.deal(this.dealer, i === 1 ? null : view.dealer[i]!, DEALER_Y);
      }
    }
    await this.showPlayer(v);
    this.drawHands(v, t);

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
      this.banner.setY(hands.length > 1 ? 166 : 182);
      this.banner.setText(t(`blackjack.outcomes.${view.outcome}`));
      if (!this.reduceMotion) this.tweens.add({ targets: this.banner, scale: { from: 0.5, to: 1 }, duration: 250, ease: 'Back.easeOut' });
      if (view.payout > view.bet) {
        view.outcome === 'blackjack' ? sfx.bigWin() : sfx.win();
        this.celebrate(view.payout, W / 2, PLAYER_Y);
      } else if (view.payout === 0) sfx.lose();
    }
  }
}
