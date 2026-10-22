import { useSettings } from '../store/settings';

/** Tiny synthesized sound effects — no audio assets to ship or license. */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  const volume = useSettings.getState().volume;
  if (volume <= 0) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, duration: number, type: OscillatorType = 'square', delay = 0, gain = 0.15) {
  const ac = audio();
  if (!ac) return;
  const volume = useSettings.getState().volume;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  const t = ac.currentTime + delay;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(gain * volume, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

export const sfx = {
  click: () => tone(660, 0.05),
  chip: () => {
    tone(1200, 0.04, 'triangle');
    tone(1600, 0.04, 'triangle', 0.03);
  },
  tick: () => tone(900, 0.02, 'square', 0, 0.06),
  card: () => tone(300, 0.06, 'triangle', 0, 0.2),
  stop: () => tone(220, 0.08, 'square', 0, 0.12),
  dice: () => {
    for (let i = 0; i < 5; i++) tone(180 + Math.random() * 200, 0.03, 'square', i * 0.05, 0.08);
  },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, 'square', i * 0.09)),
  bigWin: () => [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, 0.14, 'square', i * 0.1)),
  lose: () => {
    tone(330, 0.12, 'triangle');
    tone(247, 0.2, 'triangle', 0.12);
  },
};
