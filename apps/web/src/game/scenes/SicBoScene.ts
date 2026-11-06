import Phaser from 'phaser';
import { SICBO_ANY_TRIPLE_ODDS, SICBO_TOTAL_ODDS, sicBoReturn, type SicBoResult } from '@casino/shared';
import { sfx } from '../../audio/sfx';
import { parseKey } from '../../lib/bets';
import { ensureDiceTextures, ensureSicBoProps, hdImage, hdScale } from '../art';
import { TableScene } from './TableScene';

import { adaptiveWorldWidth, diceBoardLayout, topRowSpots, type DiceBoardLayout } from '../layouts/diceBoard';

const FELT: number | null = null;
const DARK = 0x0a3d26;
const TOP_STYLE: Record<string, { fill: number | null; label: string; size: number; display?: boolean; sub: string }> = {
  small: { fill: DARK, label: 'sicbo.small', size: 18, display: true, sub: '4–10 · 1:1' },
  odd: { fill: FELT, label: 'sicbo.odd', size: 14, sub: '1:1' },
  anyTriple: { fill: 0x4e1a85, label: 'sicbo.anyTriple', size: 11, sub: `${SICBO_ANY_TRIPLE_ODDS}:1` },
  even: { fill: FELT, label: 'sicbo.even', size: 14, sub: '1:1' },
  big: { fill: DARK, label: 'sicbo.big', size: 18, display: true, sub: '11–17 · 1:1' },
};

/**
 * Sic Bo table (Tài Xỉu extends it). Positions come from layouts/diceBoard.ts: dice plate on the
 * left, betting board on the right, both inside the felt; the world is as wide as the stage allows.
 */
export class SicBoScene extends TableScene {
  static readonly KEY = 'sicbo';
  protected dice: Phaser.GameObjects.Image[] = [];
  protected resultText!: Phaser.GameObjects.Text;
  /** Crystal shaker dome shown over the dice while they tumble (Sic Bo only; created on first roll). */
  private dome: Phaser.GameObjects.Image | null = null;
  /** Table geometry for this mount (fixed for the scene's lifetime: a resize only re-fits the canvas). */
  layout!: DiceBoardLayout;

  constructor(key: string = SicBoScene.KEY) {
    super(key);
  }

  /** Landscape world as wide as the stage (16:9 … ~2.3:1); portrait slices keep the 640 world. */
  protected override landscapeWidth() {
    return this.portrait ? 640 : adaptiveWorldWidth(this.stageAspect);
  }

  private geo(): DiceBoardLayout {
    return (this.layout ??= diceBoardLayout(this.sw, this.sh));
  }

  protected build() {
    const L = this.geo();
    ensureDiceTextures(this);
    ensureSicBoProps(this);
    // V7.1 2.5D porcelain dice plate with a bevelled gold rim (art.ts ensureSicBoProps).
    hdImage(this, L.bowl.x, L.bowl.y, 'sicbo-plate');
    [-26, 0, 26].forEach((dx, i) => {
      this.dice.push(hdImage(this, L.bowl.x + dx, L.bowl.y + (i === 1 ? -16 : 12), `die-${i + 1}`, 0.95));
    });
    this.resultText = this.text(L.result.x, L.result.y, '', { size: 15, display: true, shadow: true });
    this.text(L.title.x, L.title.y, this.title(), { size: 20, display: true, color: '#ffe08a', originX: 0, shadow: true });

    // Row 1: small · odd · any triple · even · big
    for (const spot of topRowSpots(L)) {
      const st = TOP_STYLE[spot.key]!;
      this.addSpot(spot.key, spot.x, L.row1.y, spot.w, L.row1.h, st.fill, st.label, { translate: true, size: st.size, display: st.display, sub: st.sub });
    }

    // Row 2: totals 4..17
    const tw = L.row2.w / 14;
    for (let total = 4; total <= 17; total++) {
      this.addSpot(`total:${total}`, L.row2.x + (total - 4) * tw, L.row2.y, tw, L.row2.h, total % 2 ? FELT : DARK, String(total), {
        size: 15,
        display: true,
        sub: `${SICBO_TOTAL_ODDS[total]}:1`,
      });
    }
    this.label(L.board.x + L.board.w / 2, L.totalLabelY, 'sicbo.total', { size: 9, color: '#f7e2a8' });

    // Row 3: singles 1..6
    const sw = L.row3.w / 6;
    for (let face = 1; face <= 6; face++) {
      const x = L.row3.x + (face - 1) * sw;
      this.addSpot(`single:${face}`, x, L.row3.y, sw, L.row3.h, face % 2 ? DARK : FELT, '', { sub: '1:1 2:1 3:1' });
      hdImage(this, x + sw / 2, L.row3.y + L.row3.h * 0.4, `die-${face}`, 0.7);
    }
    this.label(L.board.x + L.board.w / 2, L.singleLabelY, 'sicbo.single', { size: 9, color: '#f7e2a8' });
  }

  /** Spot rectangles in world units (QA / regression tests read them through the cameras). */
  spotRects(): { key: string; x: number; y: number; w: number; h: number }[] {
    return [...this.spots.values()].map((s) => ({ key: s.key, x: s.x, y: s.y, w: s.w, h: s.h }));
  }

  protected title() {
    return 'SIC BO';
  }

  /** Tall PC window: plate on top, then the board in slices — totals split into 4–10 and 11–17. */
  override portraitRegions() {
    const L = this.geo();
    const tw = L.row2.w / 14;
    return [
      { x: L.content.x - 8, y: L.bowl.y - 92, w: L.bowl.r * 2 + 48, h: 200, maxZoom: 0.74 },
      { x: L.board.x - 4, y: L.title.y - 14, w: L.board.w + 8, h: L.row1.y + L.row1.h - L.title.y + 18 },
      { x: L.row2.x - 2, y: L.row2.y - 2, w: tw * 7 + 4, h: L.row2.h + 4, maxZoom: 1.6, gap: 2 },
      { x: L.row2.x + tw * 7 - 2, y: L.row2.y - 2, w: tw * 7 + 4, h: L.row2.h + 4, maxZoom: 1.6 },
      { x: L.board.x - 4, y: L.row3.y - 4, w: L.board.w + 8, h: L.singleLabelY - L.row3.y + 12 },
    ];
  }

  async roll(result: SicBoResult): Promise<void> {
    this.interactive = false;
    this.highlightSpots([]);
    this.resultText.setText('');
    if (!this.reduceMotion) {
      const { x: BOWL_X, y: BOWL_Y } = this.geo().bowl;
      const homes = this.dice.map((d) => ({ x: d.x, y: d.y }));
      // The crystal dome drops over the plate, the dice tumble under it (motion-blur frames), then it lifts.
      const dome = (this.dome ??= hdImage(this, BOWL_X, BOWL_Y, 'sicbo-dome').setDepth(9).setAlpha(0));
      dome.setPosition(BOWL_X, BOWL_Y - 18).setAlpha(0);
      this.tweens.add({ targets: dome, y: BOWL_Y, alpha: 1, duration: 140, ease: 'Quad.easeOut' });
      for (let i = 0; i < 14; i++) {
        sfx.dice();
        dome.setPosition(BOWL_X + Phaser.Math.Between(-3, 3), BOWL_Y + Phaser.Math.Between(-2, 2));
        this.dice.forEach((d, j) => {
          d.setTexture(i < 10 && (i + j) % 2 === 0 ? 'die-blur' : `die-${Phaser.Math.Between(1, 6)}`);
          d.setPosition(homes[j]!.x + Phaser.Math.Between(-10, 10), homes[j]!.y + Phaser.Math.Between(-10, 10));
          d.setAngle(Phaser.Math.Between(-30, 30));
        });
        await this.wait(70 + i * 6);
      }
      this.dice.forEach((d, j) => {
        d.setPosition(homes[j]!.x, homes[j]!.y);
        d.setAngle(0);
      });
      dome.setPosition(BOWL_X, BOWL_Y);
      this.tweens.add({ targets: dome, y: BOWL_Y - 34, alpha: 0, duration: 260, ease: 'Quad.easeIn' });
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
      this.celebrate(result.payout, this.geo().centre.x, this.geo().centre.y, big);
    } else sfx.lose();
    await this.wait(this.reduceMotion ? 200 : 600);
    this.interactive = true;
  }
}
