import Phaser from 'phaser';
import { SICBO_ANY_TRIPLE_ODDS, SICBO_TOTAL_ODDS, sicBoReturn, type SicBoResult } from '@casino/shared';
import { sfx } from '../../audio/sfx';
import { parseKey } from '../../lib/bets';
import { ensureDiceTextures, hdImage, hdScale } from '../art';
import { TableScene } from './TableScene';

export const BOWL_X = 112;
export const BOWL_Y = 176;
const BX = 226;
const BW = 404;
const FELT: number | null = null;
const DARK = 0x0a3d26;

export class SicBoScene extends TableScene {
  static readonly KEY = 'sicbo';
  protected dice: Phaser.GameObjects.Image[] = [];
  protected resultText!: Phaser.GameObjects.Text;

  constructor() {
    super(SicBoScene.KEY);
  }

  protected build() {
    ensureDiceTextures(this);
    const g = this.add.graphics();
    // Porcelain dice plate with a gold rim
    g.fillStyle(0x000000, 0.45).fillCircle(BOWL_X + 3, BOWL_Y + 5, 74);
    g.fillStyle(0x8a5a12, 1).fillCircle(BOWL_X, BOWL_Y, 72);
    g.fillStyle(0xf2c14e, 1).fillCircle(BOWL_X, BOWL_Y, 70);
    g.fillStyle(0xfbf7ee, 1).fillCircle(BOWL_X, BOWL_Y, 65);
    g.fillStyle(0xe6dfd0, 1).fillCircle(BOWL_X + 3, BOWL_Y + 4, 57);
    g.fillStyle(0xffffff, 0.6).fillEllipse(BOWL_X - 22, BOWL_Y - 30, 40, 14);
    [-26, 0, 26].forEach((dx, i) => {
      this.dice.push(hdImage(this, BOWL_X + dx, BOWL_Y + (i === 1 ? -16 : 12), `die-${i + 1}`, 0.95));
    });
    this.resultText = this.text(BOWL_X, BOWL_Y + 96, '', { size: 15, display: true, shadow: true });
    this.text(BX, 44, this.title(), { size: 20, display: true, color: '#ffe08a', originX: 0, shadow: true });

    // Row 1: small · odd · any triple · even · big
    const y1 = 64;
    this.addSpot('small', BX, y1, 84, 60, DARK, 'sicbo.small', { translate: true, size: 18, display: true, sub: '4–10 · 1:1' });
    this.addSpot('odd', BX + 84, y1, 72, 60, FELT, 'sicbo.odd', { translate: true, size: 14, sub: '1:1' });
    this.addSpot('anyTriple', BX + 156, y1, 92, 60, 0x4e1a85, 'sicbo.anyTriple', {
      translate: true,
      size: 11,
      sub: `${SICBO_ANY_TRIPLE_ODDS}:1`,
    });
    this.addSpot('even', BX + 248, y1, 72, 60, FELT, 'sicbo.even', { translate: true, size: 14, sub: '1:1' });
    this.addSpot('big', BX + 320, y1, 84, 60, DARK, 'sicbo.big', { translate: true, size: 18, display: true, sub: '11–17 · 1:1' });

    // Row 2: totals 4..17
    const y2 = y1 + 68;
    const tw = BW / 14;
    for (let total = 4; total <= 17; total++) {
      this.addSpot(`total:${total}`, BX + (total - 4) * tw, y2, tw, 54, (total % 2 ? FELT : DARK), String(total), {
        size: 15,
        display: true,
        sub: `${SICBO_TOTAL_ODDS[total]}:1`,
      });
    }
    this.label(BX + BW / 2, y2 + 62, 'sicbo.total', { size: 9, color: '#f7e2a8' });

    // Row 3: singles 1..6
    const y3 = y2 + 74;
    const sw = BW / 6;
    for (let face = 1; face <= 6; face++) {
      const x = BX + (face - 1) * sw;
      this.addSpot(`single:${face}`, x, y3, sw, 60, face % 2 ? DARK : FELT, '', { sub: '1:1 2:1 3:1' });
      hdImage(this, x + sw / 2, y3 + 24, `die-${face}`, 0.7);
    }
    this.label(BX + BW / 2, y3 + 70, 'sicbo.single', { size: 9, color: '#f7e2a8' });
  }

  protected title() {
    return 'SIC BO';
  }

  async roll(result: SicBoResult): Promise<void> {
    this.interactive = false;
    this.highlightSpots([]);
    this.resultText.setText('');
    if (!this.reduceMotion) {
      const homes = this.dice.map((d) => ({ x: d.x, y: d.y }));
      for (let i = 0; i < 14; i++) {
        sfx.dice();
        this.dice.forEach((d, j) => {
          d.setTexture(`die-${Phaser.Math.Between(1, 6)}`);
          d.setPosition(homes[j]!.x + Phaser.Math.Between(-10, 10), homes[j]!.y + Phaser.Math.Between(-10, 10));
          d.setAngle(Phaser.Math.Between(-30, 30));
        });
        await this.wait(70 + i * 6);
      }
      this.dice.forEach((d, j) => {
        d.setPosition(homes[j]!.x, homes[j]!.y);
        d.setAngle(0);
      });
    }
    this.dice.forEach((d, i) => d.setTexture(`die-${result.dice[i]}`));
    sfx.stop();
    if (!this.reduceMotion) await this.tweenP({ targets: this.dice, scale: hdScale('die-1', 1.15), yoyo: true, duration: 140 });

    this.resultText.setText(this.t('sicbo.result', { dice: result.dice.join('-'), total: result.total }));
    const winning = [...this.spots.keys()].filter((key) => sicBoReturn(parseKey(key), result.dice) > 0);
    this.highlightSpots(winning);
    if (result.payout > 0) {
      const big = result.payout >= result.bets.reduce((s, b) => s + b.amount, 0) * 10;
      big ? sfx.bigWin() : sfx.win();
      this.celebrate(result.payout, 428, 180, big);
    } else sfx.lose();
    await this.wait(this.reduceMotion ? 200 : 600);
    this.interactive = true;
  }
}
