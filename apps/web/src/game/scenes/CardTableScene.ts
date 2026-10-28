import Phaser from 'phaser';
import { vipTierOf, type Card, type CardTableView } from '@casino/shared';
import { sfx } from '../../audio/sfx';
import { compactChips } from '../../lib/format';
import { cardKey, chipDenomFor, ensureCardBackTexture, ensureCardTexture, ensureChipTextures, hdImage, hdScale } from '../art';
import { assetSrc } from '../../store/catalog';
import { BaseScene } from './BaseScene';

type XY = { x: number; y: number };
const CENTER: XY = { x: 320, y: 172 };
const DECK: XY = { x: 320, y: 150 };

/** Seat slots around the table: avatar position and where that seat's cards sit. Slot 0 is always the viewer. */
const SLOTS: Record<string, { at: XY; cards: XY }> = {
  bottom: { at: { x: 320, y: 318 }, cards: { x: 320, y: 244 } },
  bottomLeft: { at: { x: 84, y: 238 }, cards: { x: 166, y: 214 } },
  topLeft: { at: { x: 100, y: 88 }, cards: { x: 182, y: 118 } },
  top: { at: { x: 320, y: 36 }, cards: { x: 320, y: 104 } },
  topRight: { at: { x: 540, y: 88 }, cards: { x: 458, y: 118 } },
  bottomRight: { at: { x: 556, y: 238 }, cards: { x: 474, y: 214 } },
};
const LAYOUT: Record<number, (keyof typeof SLOTS)[]> = {
  2: ['bottom', 'top'],
  3: ['bottom', 'topLeft', 'topRight'],
  4: ['bottom', 'bottomLeft', 'top', 'bottomRight'],
  5: ['bottom', 'bottomLeft', 'topLeft', 'topRight', 'bottomRight'],
  6: ['bottom', 'bottomLeft', 'topLeft', 'top', 'topRight', 'bottomRight'],
};

const AVATAR_COLORS = [0xd42a44, 0x2f5ee8, 0x1f9d61, 0xb45cff, 0xe0a83a, 0xff6f9f, 0x5ad8ff, 0xff9d3a];

export interface CardBackLook {
  key: string;
  colors: string[];
  royal: boolean;
}

/**
 * Shared table for Poker Texas Hold'em, Liêng and Xì Tố. Draws whatever the server view says:
 * the viewer only ever receives their own hidden cards; others are shown with their card back.
 */
const VIP_COLORS = { silver: 0xc9cfdc, gold: 0xf2c14e, platinum: 0x9fe7f5, diamond: 0x5ab8ff, royal: 0xc27bff } as const;

export class CardTableScene extends BaseScene {
  static readonly KEY = 'card-table';
  private layer!: Phaser.GameObjects.Container;
  private timer!: Phaser.GameObjects.Graphics;
  private dealt = new Set<string>();
  private handSeq = -1;
  private lastResultSeq = -1;
  private view: CardTableView | null = null;
  private now: () => number = Date.now;
  private timerAt: { pos: XY; deadline: number; total: number } | null = null;
  private strings: Record<string, string> = {};
  /** Tap/click on an occupied seat (avatar or name plate): the page opens the player menu at that point. */
  private onSeat?: (uid: number, at: { x: number; y: number }) => void;
  private backs: Record<number, CardBackLook | undefined> = {};
  /** Uploaded profile photos being fetched (texture key → URL); the seats redraw once one arrives. */
  private loadingPhotos = new Set<string>();

  constructor() {
    super(CardTableScene.KEY);
  }

  protected build() {
    ensureChipTextures(this);
    ensureCardTexture(this, null);
    const g = this.add.graphics();
    // Rail, felt and printed line.
    g.fillStyle(0x000000, 0.45).fillEllipse(CENTER.x + 3, CENTER.y + 6, 572, 284);
    g.fillStyle(0x3a1e0c, 1).fillEllipse(CENTER.x, CENTER.y, 570, 280);
    g.lineStyle(2, 0xe8b64a, 0.9).strokeEllipse(CENTER.x, CENTER.y, 566, 276);
    g.fillStyle(0x0f5a39, 1).fillEllipse(CENTER.x, CENTER.y, 540, 252);
    g.fillStyle(0x1f8a5a, 0.35).fillEllipse(CENTER.x, CENTER.y - 20, 420, 150);
    g.lineStyle(1, 0xf2d38a, 0.5).strokeEllipse(CENTER.x, CENTER.y, 470, 200);
    this.text(CENTER.x, CENTER.y + 62, 'KEYO', { size: 22, display: true, color: '#f2d38a' }).setAlpha(0.18);
    this.layer = this.add.container(0, 0);
    this.timer = this.add.graphics().setDepth(30);
  }

  /** Localised strings for in-canvas labels (fold, all-in, hand names…). */
  setLabels(labels: Record<string, string>) {
    this.strings = labels;
  }

  setSeatHandler(fn: (uid: number, at: { x: number; y: number }) => void) {
    this.onSeat = fn;
  }

  setClock(now: () => number) {
    this.now = now;
  }

  private slotOf(seat: number, view: CardTableView) {
    const n = view.table.config.seats;
    const layout = LAYOUT[n] ?? LAYOUT[6]!;
    const me = view.mySeat;
    const idx = me === null ? seat : (seat - me + n) % n;
    return SLOTS[layout[idx % layout.length]!]!;
  }

  private card(x: number, y: number, card: Card | null, scale: number, back: CardBackLook | undefined, key: string) {
    let tex = cardKey(card);
    if (card) ensureCardTexture(this, card);
    else if (back) {
      ensureCardBackTexture(this, back.key, back.colors, back.royal);
      tex = back.key;
    }
    const img = hdImage(this, x, y, tex, scale);
    this.layer.add(img);
    if (!this.dealt.has(key) && !this.reduceMotion) {
      this.dealt.add(key);
      const target = { x, y };
      img.setPosition(DECK.x, DECK.y).setAlpha(0);
      this.tweens.add({ targets: img, ...target, alpha: 1, duration: 260, delay: this.dealt.size * 25, ease: 'Cubic.easeOut' });
      sfx.card();
    } else this.dealt.add(key);
    return img;
  }

  /**
   * A seated player's uploaded photo as a round image, or null while it loads (the coloured
   * initial shows meanwhile). A photo that fails to load keeps the initial.
   */
  private photo(url: string | null | undefined, x: number, y: number): Phaser.GameObjects.Image | null {
    const src = assetSrc(url);
    if (!src) return null;
    const key = `photo:${url}`;
    if (!this.textures.exists(key)) {
      if (!this.loadingPhotos.has(key)) {
        this.loadingPhotos.add(key);
        this.load.setCORS('anonymous');
        this.load.image(key, src);
        this.load.once(`filecomplete-image-${key}`, () => this.view && this.render(this.view, this.backs));
        this.load.start();
      }
      return null;
    }
    const img = this.add.image(x, y, key).setDisplaySize(30, 30);
    const mask = this.make.graphics({}, false).fillStyle(0xffffff).fillCircle(x, y, 15);
    img.setMask(mask.createGeometryMask());
    return img;
  }

  render(view: CardTableView, backs: Record<number, CardBackLook | undefined>) {
    this.view = view;
    this.backs = backs;
    this.layer.removeAll(true);
    const hand = view.hand;
    if (hand && hand.seq !== this.handSeq) {
      this.handSeq = hand.seq;
      this.dealt.clear();
    }
    const n = view.table.config.seats;
    const hp = new Map((hand?.players ?? []).map((p) => [p.seat, p]));
    // Seats (occupied and empty).
    for (let seat = 0; seat < n; seat++) {
      const slot = this.slotOf(seat, view);
      const s = view.seats.find((x) => x.seat === seat);
      if (!s) {
        const ring = this.add.circle(slot.at.x, slot.at.y, 16, 0x000000, 0.25).setStrokeStyle(1, 0xf2d38a, 0.35);
        this.layer.add([ring, this.text(slot.at.x, slot.at.y, '+', { size: 14, color: '#f2d38a' }).setAlpha(0.5)]);
        continue;
      }
      const p = hp.get(seat);
      const color = AVATAR_COLORS[s.uid % AVATAR_COLORS.length]!;
      const isTurn = hand?.toActSeat === seat && hand.phase === 'betting';
      const won = hand?.result && (hand.result.payouts[seat] ?? 0) > 0 && (hand.result.net[seat] ?? 0) > 0;
      const halo = this.add.circle(slot.at.x, slot.at.y, 20, won ? 0xffe08a : isTurn ? 0x5ad8ff : 0x000000, won || isTurn ? 0.35 : 0);
      const av = this.add.circle(slot.at.x, slot.at.y, 16, color).setStrokeStyle(2, s.uid === -1 ? 0xffffff : 0xf2d38a);
      const initial = this.text(slot.at.x, slot.at.y, (s.displayName[0] ?? '?').toUpperCase(), { size: 14, display: true, shadow: true });
      const photo = this.photo(s.customAvatar, slot.at.x, slot.at.y);
      if (photo) initial.setVisible(false);
      const nameY = slot.at.y + (slot.at.y > CENTER.y ? -38 : 27); // clear of the turn-timer ring
      const plate = this.add.rectangle(slot.at.x, nameY + 6, 84, 24, 0x05040b, 0.78).setStrokeStyle(1, 0xf2d38a, 0.4);
      const name = this.text(slot.at.x, nameY, s.displayName.slice(0, 12), { size: 8, weight: 700 });
      const stack = this.text(slot.at.x, nameY + 11, compactChips(p ? p.stack : s.stack), { size: 9, color: '#ffe08a', weight: 800 });
      this.layer.add([halo, av, initial, plate, name, stack]);
      if (photo) this.layer.add(photo);
      // VIP tag on the avatar's lower-right rim (away from the face, the cards and the chips).
      if (s.vipLevel > 1) {
        const tier = vipTierOf(s.vipLevel);
        const vx = slot.at.x + 13;
        const vy = slot.at.y + 12;
        this.layer.add([
          this.add.circle(vx, vy, 7, VIP_COLORS[tier]).setStrokeStyle(1, 0x05040b),
          this.text(vx, vy, String(s.vipLevel), { size: s.vipLevel >= 10 ? 6 : 7, color: '#1b1636', weight: 800 }),
        ]);
      }
      for (const hit of [av, plate]) {
        hit.setInteractive({ useHandCursor: true }).on('pointerup', (ptr: Phaser.Input.Pointer) => {
          const ev = ptr.event as MouseEvent | TouchEvent | undefined;
          const touch = ev && 'changedTouches' in ev ? ev.changedTouches[0] : undefined;
          const x = touch?.clientX ?? (ev as MouseEvent | undefined)?.clientX ?? 0;
          const y = touch?.clientY ?? (ev as MouseEvent | undefined)?.clientY ?? 0;
          this.onSeat?.(s.uid, { x, y });
        });
      }
      if (p?.folded || s.status !== 'active') {
        av.setAlpha(0.45);
        initial.setAlpha(0.5);
        const tag = p?.folded ? this.strings.fold : s.status === 'leaving' ? this.strings.leaving : this.strings.sittingOut;
        if (tag) this.layer.add(this.text(slot.at.x, slot.at.y + (slot.at.y > CENTER.y ? 27 : 46), tag, { size: 8, color: '#ff9fae', weight: 700, shadow: true }));
      } else if (p?.allIn && !hand?.result) this.layer.add(this.text(slot.at.x, slot.at.y + (slot.at.y > CENTER.y ? 27 : 46), this.strings.allIn ?? 'ALL-IN', { size: 9, color: '#ffe08a', weight: 800, shadow: true }));
      if (hand && hand.button === seat) {
        const bx = slot.at.x + 24;
        const by = slot.at.y - 14;
        this.layer.add([this.add.circle(bx, by, 7, 0xffffff).setStrokeStyle(1, 0x8a5a12), this.text(bx, by, 'D', { size: 8, color: '#1b1636', weight: 800 })]);
      }
      if (isTurn && hand?.deadline) this.timerAt = { pos: slot.at, deadline: hand.deadline, total: view.table.config.turnMs };
      // Cards.
      if (p && !p.folded) {
        const mine = seat === view.mySeat;
        const shown = hand?.result?.shown[seat];
        const hidden = shown ? shown.cards.slice(0, p.hole.length) : p.hole;
        const scale = mine ? 0.82 : 0.56;
        const all: { c: Card | null; up: boolean }[] = [...hidden.map((c) => ({ c, up: false })), ...p.up.map((c) => ({ c, up: true }))];
        const step = (mine ? 26 : 17) * (all.length > 3 ? 0.85 : 1);
        all.forEach(({ c, up }, i) => {
          const x = slot.cards.x + (i - (all.length - 1) / 2) * step;
          const img = this.card(x, slot.cards.y, c, scale, backs[seat], `${hand!.seq}:${seat}:${i}`);
          if (mine && !up && !shown) img.setTint(0xf2f0ff);
          if (shown && hand?.result && shown.best.includes(c as Card)) img.setY(slot.cards.y - 4);
        });
        if (shown) {
          const label = this.strings[`hand_${shown.category}`] ?? shown.category;
          // Centre seats put the label beside their cards so it covers neither the name plate nor the pot.
          if (slot.cards.x === CENTER.x) this.layer.add(this.text(slot.cards.x + (all.length * step) / 2 + 22, slot.cards.y, label, { size: mine ? 9 : 8, color: '#fff1b8', weight: 800, shadow: true, originX: 0 }));
          else this.layer.add(this.text(slot.cards.x, slot.cards.y + 26, label, { size: 8, color: '#fff1b8', weight: 800, shadow: true }));
        }
      }
      // Bet in front of the seat.
      if (p && p.streetBet > 0 && hand?.phase === 'betting') {
        // Centre seats bet to the left of their cards (the pot and board are straight ahead); others toward the centre.
        const centred = slot.cards.x === CENTER.x;
        const bx = centred ? slot.cards.x - 72 : slot.cards.x + (CENTER.x - slot.cards.x) * 0.42;
        const by = centred ? slot.cards.y : slot.cards.y + (CENTER.y - slot.cards.y) * 0.42 + 4;
        const tex = `chip-${chipDenomFor(p.streetBet)}`;
        this.layer.add([this.add.image(bx - 10, by, tex).setScale(hdScale(tex, 0.45)), this.text(bx + 8, by, compactChips(p.streetBet), { size: 8, weight: 800, shadow: true, originX: 0 })]);
      }
      // Winnings.
      if (hand?.result && (hand.result.net[seat] ?? 0) !== 0) {
        const net = hand.result.net[seat]!;
        const txt = this.text(slot.at.x, slot.at.y + (slot.at.y > CENTER.y ? 26 : -26), `${net > 0 ? '+' : ''}${compactChips(net)}`, { size: 12, color: net > 0 ? '#7ff0a8' : '#ff9fae', display: true, shadow: true });
        this.layer.add(txt);
      }
    }
    if (!hand || hand.phase !== 'betting' || hand.toActSeat === null) this.timerAt = null;
    // Board and pot.
    if (hand) {
      hand.board.forEach((c, i) => this.card(CENTER.x + (i - 2) * 34, CENTER.y, c, 0.64, undefined, `${hand.seq}:board:${i}`));
      if (hand.pot > 0) {
        const tex = `chip-${chipDenomFor(hand.pot)}`;
        this.layer.add([this.add.image(CENTER.x - 30, CENTER.y - 44, tex).setScale(hdScale(tex, 0.55)), this.text(CENTER.x + 4, CENTER.y - 44, `${this.strings.pot ?? 'Pot'} ${compactChips(hand.pot)}`, { size: 11, color: '#fff1b8', weight: 800, shadow: true })]);
      }
      if (hand.result && this.lastResultSeq !== hand.seq) {
        this.lastResultSeq = hand.seq;
        const myNet = view.mySeat !== null ? (hand.result.net[view.mySeat] ?? 0) : 0;
        if (myNet > 0) {
          sfx.win();
          this.celebrate(myNet, CENTER.x, CENTER.y + 40, myNet >= view.table.config.bigBlind * 50);
        }
      }
    }
  }

  override update() {
    this.timer.clear();
    if (!this.timerAt) return;
    const left = Math.max(0, this.timerAt.deadline - this.now());
    const frac = left / this.timerAt.total;
    const color = frac > 0.5 ? 0x7ff0a8 : frac > 0.2 ? 0xffe08a : 0xff5a6e;
    this.timer.lineStyle(3, color, 1);
    this.timer.beginPath();
    this.timer.arc(this.timerAt.pos.x, this.timerAt.pos.y, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false);
    this.timer.strokePath();
  }
}
