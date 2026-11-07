import Phaser from 'phaser';
import { sicBoReturn, type TableRoundView, type TaiXiuOutcome } from '@casino/shared';
import { sfx } from '../../audio/sfx';
import { parseKey } from '../../lib/bets';
import { ensureBowlTexture, hdImage, hdScale } from '../art';
import { SicBoScene } from './SicBoScene';

type Round = TableRoundView['round'];
type Stage = 'shake' | 'bet' | 'reveal' | 'result' | 'void';

/** Lifted away up and slightly left, clear of the betting spots, the dice and the result line. */
const LIFT_X = -16;
const LIFT_Y = 132;

/**
 * Shared Tài Xỉu table. Everything on screen is derived from the round timestamps and the
 * (server-synced) clock, so a player who joins mid-round sees exactly the current moment:
 * bowl shaking → covered while betting → bowl slowly lifted → result.
 */
export class TaiXiuScene extends SicBoScene {
  private bowl!: Phaser.GameObjects.Image;
  private round: Round | null = null;
  private now: () => number = Date.now;
  private stage = '';
  private lastRattle = 0;

  protected override title() {
    return 'TÀI XỈU';
  }

  protected override build() {
    super.build();
    ensureBowlTexture(this);
    // Seen from above, the cover sits centred on the dice plate (layouts/diceBoard.ts).
    this.bowl = hdImage(this, this.layout.bowl.x, this.layout.bowl.y, 'taixiu-bowl', this.layout.plateScale).setDepth(8);
    this.dice.forEach((d) => d.setVisible(false));
  }

  /** Follow a round; `now` returns the server-synced clock in ms. */
  setRound(round: Round, now: () => number) {
    this.round = round;
    this.now = now;
  }

  override update() {
    const r = this.round;
    if (!r || !this.bowl) return;
    const now = this.now();
    const betsOpen = Date.parse(r.betsOpenAt);
    const locks = Date.parse(r.locksAt);
    const reveal = Date.parse(r.revealAt);
    const outcome = r.outcome as TaiXiuOutcome | null;

    if (r.status === 'void') return this.enter('void', r, () => this.cover());
    if (now < betsOpen) {
      this.enter('shake', r, () => this.cover());
      if (this.reduceMotion) return;
      // Seen from above, a shake slides the cover around on the plate and turns it a little.
      this.bowl.setPosition(this.layout.bowl.x + Math.sin(now / 38) * 5, this.layout.bowl.y + Math.cos(now / 53) * 4);
      this.bowl.setAngle(Math.sin(now / 47) * 9);
      if (now - this.lastRattle > 170) {
        this.lastRattle = now;
        sfx.dice();
      }
      return;
    }
    if (now < locks || !outcome) {
      this.enter('bet', r, () => this.cover());
      return;
    }
    if (now < reveal && !this.reduceMotion) {
      this.enter('reveal', r, () => this.showDice(outcome));
      const p = (now - locks) / (reveal - locks);
      // A short pause with a nervous wobble, then the bowl rises.
      const lift = Phaser.Math.Easing.Cubic.InOut(Phaser.Math.Clamp((p - 0.25) / 0.6, 0, 1));
      const wobble = p < 0.25 ? Math.sin(now / 30) * 1.5 * (p / 0.25) : 0;
      this.placeBowl(lift, wobble);
      return;
    }
    this.enter('result', r, () => {
      this.showDice(outcome);
      this.placeBowl(1, 0);
      this.announce(outcome);
    });
  }

  private enter(stage: Stage, r: Round, fn: () => void) {
    const key = `${r.id}:${stage}`;
    if (this.stage === key) return;
    this.stage = key;
    fn();
  }

  private cover() {
    this.bowl.setPosition(this.layout.bowl.x, this.layout.bowl.y).setAngle(0).setAlpha(1).setScale(hdScale('taixiu-bowl', this.layout.plateScale));
    this.dice.forEach((d) => d.setVisible(false));
    this.resultText.setText('');
    this.highlightSpots([]);
  }

  private showDice(o: TaiXiuOutcome) {
    this.dice.forEach((d, i) => d.setTexture(`die-${o.dice[i]}`).setVisible(true));
  }

  private placeBowl(lift: number, wobble: number) {
    // Lifted towards the viewer: it grows slightly while it slides off the plate.
    this.bowl.setPosition(this.layout.bowl.x + lift * LIFT_X * this.layout.plateScale, this.layout.bowl.y - lift * LIFT_Y * this.layout.plateScale);
    this.bowl.setAngle(-lift * 18 + wobble);
    this.bowl.setScale(hdScale('taixiu-bowl', this.layout.plateScale * (1 + lift * 0.05)));
    this.bowl.setAlpha(1 - lift * 0.12);
  }

  private announce(o: TaiXiuOutcome) {
    sfx.stop();
    const side = o.side === 'triple' ? this.t('tables.triple') : this.t(`tables.${o.side}`);
    this.resultText.setText(`${o.dice.join('-')} = ${o.total} · ${side}`);
    this.resultText.setColor(o.side === 'tai' ? '#ffd27a' : o.side === 'xiu' ? '#9fd8ff' : '#e6a8ff');
    this.highlightSpots([...this.spots.keys()].filter((key) => sicBoReturn(parseKey(key), o.dice) > 0));
    if (!this.reduceMotion) this.tweens.add({ targets: this.dice, scale: hdScale('die-1', 1.15 * 0.95 * this.layout.plateScale), yoyo: true, duration: 160 });
  }
}
