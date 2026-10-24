import Phaser from 'phaser';
import { rouletteColor, rouletteReturn, type RouletteOutcome, type TableRoundView } from '@casino/shared';
import { sfx } from '../../audio/sfx';
import { parseKey } from '../../lib/bets';
import { BALL_LAND_AT, ballRelative } from '../../lib/tables';
import { BALL_OUTER, BALL_POCKET, RouletteScene, STEP, WHEEL_X, WHEEL_Y } from './RouletteScene';

type Round = TableRoundView['round'];

const TAU = Math.PI * 2;
/** Idle wheel speed (rad/s); the spin decelerates back to it so there is no visible jolt. */
const IDLE_SPEED = 0.35;

interface Spin {
  roundId: string;
  startWheel: number;
  extraWheel: number;
  rel0: number;
  pocketRel: number;
}

/**
 * Shared roulette table. The spin runs for the whole reveal window (configurable, ~12–18 s):
 * wheel clockwise, ball counter-clockwise, both slowing until the ball drops into the pocket the
 * server already fixed. Position is a pure function of time, so joining mid-spin shows the same
 * moment as everyone else and the ball always ends on the server result.
 */
export class RouletteTableScene extends RouletteScene {
  private round: Round | null = null;
  private now: () => number = Date.now;
  /** Ball angle relative to the wheel while it rests in a pocket. */
  private restRel = 0;
  private spinState: Spin | null = null;
  private announced = '';
  private lastFrame = 0;
  private lastTickRel = 0;

  setRound(round: Round, now: () => number) {
    this.round = round;
    this.now = now;
  }

  /** Draw past results (oldest first) on the history strip when joining. */
  seedHistory(numbers: number[]) {
    numbers.forEach((n) => this.pushHistory(n));
  }

  override update(time: number) {
    const dt = this.lastFrame ? Math.min(0.1, (time - this.lastFrame) / 1000) : 0;
    this.lastFrame = time;
    const r = this.round;
    if (!r || !this.wheel) return;
    const now = this.now();
    const locks = Date.parse(r.locksAt);
    const reveal = Date.parse(r.revealAt);
    const outcome = r.outcome as RouletteOutcome | null;

    if (!outcome || r.status === 'void' || now < locks) {
      this.idle(dt);
      if (this.announced && !this.announced.startsWith(r.id)) this.clearResult();
      return;
    }
    if (now < reveal && !this.reduceMotion) {
      this.spinFrame(r, outcome, (now - locks) / (reveal - locks), (reveal - locks) / 1000);
      return;
    }
    // Result: the ball rides in its pocket while the wheel keeps turning slowly.
    this.restRel = outcome.pocket * STEP;
    this.idle(dt);
    if (this.announced !== r.id) {
      this.announced = r.id;
      this.announce(outcome);
    }
  }

  private idle(dt: number) {
    this.wheel.rotation = (this.wheel.rotation + IDLE_SPEED * dt) % TAU;
    this.placeBall(this.wheel.rotation + this.restRel, BALL_POCKET);
  }

  private spinFrame(r: Round, outcome: RouletteOutcome, p: number, seconds: number) {
    let s = this.spinState;
    if (!s || s.roundId !== r.id) {
      this.clearResult();
      const pocketRel = outcome.pocket * STEP;
      // Start from wherever the wheel and ball are now; seven ball laps (plus the remainder) relative to the wheel.
      const remainder = (((this.restRel - pocketRel) % TAU) + TAU) % TAU;
      // Joining late: the ball must still finish on the pocket, so the "start" is rebased to p.
      s = {
        roundId: r.id,
        startWheel: this.wheel.rotation - this.wheelTravel(p, seconds, TAU * 4),
        extraWheel: TAU * 4,
        rel0: TAU * 7 + remainder,
        pocketRel,
      };
      this.spinState = s;
      this.lastTickRel = s.rel0;
    }
    this.wheel.rotation = s.startWheel + this.wheelTravel(p, seconds, s.extraWheel);
    const q = Math.min(1, p / BALL_LAND_AT);
    const rel = ballRelative(p, s.rel0, s.pocketRel);
    // Launch from the pocket onto the outer track, run, then drop with a few bounces.
    const launch = Phaser.Math.Clamp(p / 0.03, 0, 1);
    const drop = Phaser.Math.Clamp((q - 0.78) / 0.22, 0, 1);
    const bounce = drop > 0 && drop < 1 ? Math.abs(Math.sin(drop * Math.PI * 3)) * 4 * (1 - drop) : 0;
    const radius = BALL_POCKET + (BALL_OUTER - BALL_POCKET) * launch * (1 - drop) + bounce;
    this.placeBall(this.wheel.rotation + rel, radius);
    this.restRel = rel;
    // Clicks as the ball passes pockets, slowing with it.
    if (q < 1 && this.lastTickRel - rel > STEP * 2) {
      this.lastTickRel = rel;
      sfx.tick();
    }
  }

  /** Wheel angle travelled at progress p: idle speed throughout plus extra turns that decay to zero. */
  private wheelTravel(p: number, seconds: number, extra: number) {
    return IDLE_SPEED * seconds * p + extra * (1 - (1 - p) ** 2);
  }

  private placeBall(angle: number, radius: number) {
    this.ball.setPosition(WHEEL_X + Math.sin(angle) * radius, WHEEL_Y - Math.cos(angle) * radius);
  }

  private clearResult() {
    this.announced = '';
    this.resultText.setText('');
    this.highlightSpots([]);
  }

  private announce(o: RouletteOutcome) {
    sfx.stop();
    const color = rouletteColor(o.number);
    this.resultText.setText(this.t('roulette.result', { number: o.number }));
    this.resultText.setColor(color === 'red' ? '#ff7a8a' : color === 'green' ? '#6ff0a8' : '#ffffff');
    this.pushHistory(o.number);
    this.highlightSpots([...this.spots.keys()].filter((key) => rouletteReturn(parseKey(key), o.number) > 0));
  }
}
