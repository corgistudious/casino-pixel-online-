import Phaser from 'phaser';
import { ROULETTE_WHEEL, rouletteColor, rouletteReturn, type RouletteResult } from '@casino/shared';
import { sfx } from '../../audio/sfx';
import { parseKey } from '../../lib/bets';
import { ensureWheelTextures, hdImage, WHEEL_SIZE } from '../art';
import { H } from './BaseScene';
import { TableScene } from './TableScene';

export const WHEEL_X = 104;
export const WHEEL_Y = 176;
export const STEP = (Math.PI * 2) / ROULETTE_WHEEL.length;
export const BALL_OUTER = WHEEL_SIZE / 2 - 6;
export const BALL_POCKET = WHEEL_SIZE / 2 - 17;

const BOARD_X = 214;
const BOARD_Y = 62;
const CW = 29;
const CH = 40;

const COLOR_FILL = { red: 0xb5132c, black: 0x15131f, green: null } as const;

export class RouletteScene extends TableScene {
  static readonly KEY = 'roulette';
  protected wheel!: Phaser.GameObjects.Image;
  protected ball!: Phaser.GameObjects.Image;
  protected resultText!: Phaser.GameObjects.Text;
  private history: Phaser.GameObjects.Container[] = [];

  constructor() {
    super(RouletteScene.KEY);
  }

  protected build() {
    ensureWheelTextures(this);
    const g = this.add.graphics();
    // Wooden bowl with soft shadow
    g.fillStyle(0x000000, 0.45).fillCircle(WHEEL_X + 3, WHEEL_Y + 5, WHEEL_SIZE / 2 + 9);
    g.fillStyle(0x2a1306, 1).fillCircle(WHEEL_X, WHEEL_Y, WHEEL_SIZE / 2 + 8);
    g.lineStyle(1.5, 0xe8b64a, 1).strokeCircle(WHEEL_X, WHEEL_Y, WHEEL_SIZE / 2 + 7);
    this.wheel = hdImage(this, WHEEL_X, WHEEL_Y, 'roulette-wheel');
    hdImage(this, WHEEL_X, WHEEL_Y, 'roulette-gloss').setDepth(6);
    this.ball = hdImage(this, WHEEL_X, WHEEL_Y - BALL_OUTER, 'roulette-ball').setDepth(5);
    this.resultText = this.text(WHEEL_X, WHEEL_Y + WHEEL_SIZE / 2 + 22, '', { size: 16, display: true, shadow: true });

    this.text(BOARD_X, 40, 'ROULETTE', { size: 20, display: true, color: '#ffe08a', originX: 0, shadow: true });
    this.buildBoard();
  }

  private buildBoard() {
    this.addSpot('straight:0', BOARD_X, BOARD_Y, 24, CH * 3, 0x0f7a45, '0', { display: true, size: 14 });
    for (let col = 0; col < 12; col++) {
      for (let row = 0; row < 3; row++) {
        const n = col * 3 + (3 - row);
        this.addSpot(`straight:${n}`, BOARD_X + 24 + col * CW, BOARD_Y + row * CH, CW, CH, COLOR_FILL[rouletteColor(n)], String(n), {
          display: true,
          size: 13,
        });
      }
    }
    const colX = BOARD_X + 24 + 12 * CW;
    for (let row = 0; row < 3; row++) {
      this.addSpot(`column:${3 - row}`, colX, BOARD_Y + row * CH, 34, CH, null, 'roulette.column', { translate: true, size: 9 });
    }
    const dy = BOARD_Y + CH * 3;
    for (let d = 0; d < 3; d++) {
      this.addSpot(`dozen:${d + 1}`, BOARD_X + 24 + d * CW * 4, dy, CW * 4, 30, null, `roulette.dozen${d + 1}`, { translate: true });
    }
    const oy = dy + 30;
    const outside = [
      ['low', 'roulette.low', null],
      ['even', 'roulette.even', null],
      ['red', 'roulette.red', COLOR_FILL.red],
      ['black', 'roulette.black', COLOR_FILL.black],
      ['odd', 'roulette.odd', null],
      ['high', 'roulette.high', null],
    ] as const;
    outside.forEach(([key, label, fill], i) => {
      this.addSpot(key, BOARD_X + 24 + i * CW * 2, oy, CW * 2, 32, fill, label, { translate: true });
    });
  }

  async spin(result: RouletteResult): Promise<void> {
    this.interactive = false;
    this.highlightSpots([]);
    this.resultText.setText('');
    const startWheel = this.wheel.rotation;
    const endWheel = startWheel + Math.PI * 2 * 3 + Phaser.Math.FloatBetween(0, Math.PI * 2);
    const startBall = Math.atan2(this.ball.x - WHEEL_X, -(this.ball.y - WHEEL_Y));
    // Ball runs counter-clockwise and must finish on the pocket's absolute angle.
    let endBall = endWheel + result.pocket * STEP;
    while (endBall > startBall - Math.PI * 2 * 4) endBall -= Math.PI * 2;

    const placeBall = (angle: number, radius: number) => {
      this.ball.setPosition(WHEEL_X + Math.sin(angle) * radius, WHEEL_Y - Math.cos(angle) * radius);
    };

    if (this.reduceMotion) {
      this.wheel.rotation = endWheel;
      placeBall(endBall, BALL_POCKET);
    } else {
      const state = { p: 0 };
      let lastTick = 0;
      await this.tweenP({
        targets: state,
        p: 1,
        duration: 4800,
        ease: 'Cubic.easeOut',
        onUpdate: () => {
          const p = state.p;
          this.wheel.rotation = startWheel + (endWheel - startWheel) * p;
          const angle = startBall + (endBall - startBall) * Math.min(1, p * 1.03);
          const drop = Phaser.Math.Clamp((p - 0.72) / 0.22, 0, 1);
          const bounce = drop > 0 && drop < 1 ? Math.abs(Math.sin(drop * Math.PI * 3)) * 4 * (1 - drop) : 0;
          placeBall(angle, BALL_OUTER + (BALL_POCKET - BALL_OUTER) * drop + bounce);
          if (p - lastTick > 0.02 + p * 0.06) {
            lastTick = p;
            sfx.tick();
          }
        },
      });
      placeBall(this.wheel.rotation + result.pocket * STEP, BALL_POCKET);
    }

    sfx.stop();
    const color = rouletteColor(result.number);
    this.resultText.setText(this.t('roulette.result', { number: result.number }));
    this.resultText.setColor(color === 'red' ? '#ff7a8a' : color === 'green' ? '#6ff0a8' : '#ffffff');
    this.pushHistory(result.number);

    const winning = [...this.spots.keys()].filter((key) => rouletteReturn(parseKey(key), result.number) > 0);
    this.highlightSpots(winning);
    if (result.payout > 0) {
      const big = result.payout >= result.bets.reduce((s, b) => s + b.amount, 0) * 10;
      big ? sfx.bigWin() : sfx.win();
      this.celebrate(result.payout, 420, 170, big);
    } else sfx.lose();
    await this.wait(this.reduceMotion ? 200 : 800);
    this.interactive = true;
  }

  protected pushHistory(n: number) {
    const color = rouletteColor(n);
    const c = this.add.container(0, 0);
    const fill = color === 'red' ? 0xb5132c : color === 'green' ? 0x0f7a45 : 0x15131f;
    c.add(this.add.circle(0, 0, 9, fill).setStrokeStyle(1, 0xf2d38a));
    c.add(this.text(0, 0, String(n), { size: 9, weight: 700 }));
    this.history.unshift(c);
    if (this.history.length > 14) this.history.pop()!.destroy();
    this.history.forEach((item, i) => {
      item.setPosition(BOARD_X + 34 + i * 23, H - 34);
      item.setAlpha(i === 0 ? 1 : 0.85);
    });
    if (!this.reduceMotion) this.tweens.add({ targets: c, scale: { from: 0, to: 1 }, duration: 250, ease: 'Back.easeOut' });
  }
}
