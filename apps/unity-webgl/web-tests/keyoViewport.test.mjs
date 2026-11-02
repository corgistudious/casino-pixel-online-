import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStabilizer, deviceTier, installViewportManager, renderSize, sameSize, stableBox, supportsUnity } from '../Assets/WebGLTemplates/Keyo/keyoViewport.js';

/** A window-like fake with a manual frame/timer clock. */
function fakeEnv(w, h) {
  const listeners = {};
  const vvListeners = {};
  let frames = [];
  let timers = [];
  let now = 0;
  const env = {
    innerWidth: w,
    innerHeight: h,
    visualViewport: { width: w, height: h, addEventListener: (t, f) => (vvListeners[t] = f), removeEventListener: (t) => delete vvListeners[t] },
    document: { activeElement: null, visibilityState: 'visible', addEventListener: (t, f) => (listeners['doc:' + t] = f), removeEventListener: (t) => delete listeners['doc:' + t] },
    addEventListener: (t, f) => (listeners[t] = f),
    removeEventListener: (t) => delete listeners[t],
    requestAnimationFrame: (f) => (frames.push(f), frames.length),
    cancelAnimationFrame: () => (frames = []),
    setTimeout: (f, ms) => (timers.push({ f, at: now + ms }), timers.length),
    clearTimeout: () => {},
    // helpers
    set(width, height) {
      env.innerWidth = width;
      env.innerHeight = height;
      env.visualViewport.width = width;
      env.visualViewport.height = height;
    },
    frame(n = 1) {
      for (let i = 0; i < n; i++) {
        const f = frames;
        frames = [];
        f.forEach((x) => x());
      }
    },
    advance(ms) {
      now += ms;
      const due = timers.filter((t) => t.at <= now);
      timers = timers.filter((t) => t.at > now);
      due.forEach((t) => t.f());
    },
    fire(t) {
      (listeners[t] || vvListeners[t] || listeners['doc:' + t])();
    },
    listenerCount: () => Object.keys(listeners).length + Object.keys(vvListeners).length,
  };
  return env;
}

test('sameSize / stableBox / renderSize', () => {
  assert.ok(sameSize({ w: 956, h: 440 }, { w: 957, h: 440 }));
  assert.ok(!sameSize({ w: 956, h: 440 }, { w: 956, h: 378 }));
  const land = { w: 956, h: 440 };
  assert.equal(stableBox(land, { w: 956, h: 230 }, true), land, 'keyboard: height-only shrink ignored');
  assert.deepEqual(stableBox(land, { w: 440, h: 956 }, true), { w: 440, h: 956 }, 'rotation applies');
  assert.deepEqual(stableBox(land, { w: 956, h: 230 }, false), { w: 956, h: 230 });
  assert.deepEqual(renderSize({ w: 956, h: 440 }, 3, 1.5), { w: 1434, h: 660, ratio: 1.5 });
  assert.deepEqual(renderSize({ w: 100, h: 50 }, 0.5, 2), { w: 100, h: 50, ratio: 1 });
});

test('stabilizer commits only after N identical frames, bounded', () => {
  const s = createStabilizer({ settleFrames: 3, maxFrames: 10 });
  s.start();
  assert.equal(s.push({ w: 440, h: 894 }), null);
  assert.equal(s.push({ w: 956, h: 378 }), null);
  assert.equal(s.push({ w: 956, h: 440 }), null);
  assert.equal(s.push({ w: 956, h: 440 }), null);
  assert.deepEqual(s.push({ w: 956, h: 440 }), { w: 956, h: 440 });
  assert.equal(s.active, false);
  // Never settles (size keeps changing): the last sample is committed at maxFrames, not kept stale.
  s.start();
  let out = null;
  for (let i = 0; i < 10 && !out; i++) out = s.push({ w: 956, h: 400 + i * 5 }); // 5 px steps: beyond the ±1 px tolerance
  assert.deepEqual(out, { w: 956, h: 445 });
});

test('manager: iOS-like launch sequence commits only the settled size', () => {
  const env = fakeEnv(440, 894);
  const commits = [];
  const m = installViewportManager({ env, onCommit: (s) => commits.push(s), recheckMs: [] });
  env.frame(1);
  env.set(956, 378);
  env.frame(2);
  env.set(956, 440);
  env.frame(3);
  assert.deepEqual(commits.map((c) => [c.w, c.h]), [[956, 440]], 'transient 894 / 378 never committed');
  m.stop();
});

test('manager: resume re-verifies on a bounded schedule and fixes a late change', () => {
  const env = fakeEnv(956, 440);
  const commits = [];
  const m = installViewportManager({ env, onCommit: (s) => commits.push(s), recheckMs: [100, 400] });
  env.frame(3);
  assert.equal(commits.length, 1);
  env.fire('pageshow');
  env.frame(3);
  assert.equal(commits.length, 1, 'unchanged size → no commit (no loop)');
  env.set(956, 378); // iOS restores a wrong window, then corrects it late
  env.advance(100);
  env.frame(3);
  env.set(956, 440);
  env.advance(300);
  env.frame(3);
  assert.deepEqual(commits.map((c) => [c.w, c.h]), [[956, 440], [956, 378], [956, 440]]);
  assert.match(commits[2].reason, /pageshow\+400/);
  m.stop();
});

test('manager: keyboard height shrink keeps the canvas; rotation still applies', () => {
  const env = fakeEnv(956, 440);
  const commits = [];
  const m = installViewportManager({ env, onCommit: (s) => commits.push(s), recheckMs: [] });
  env.frame(3);
  env.document.activeElement = { tagName: 'TEXTAREA' };
  env.visualViewport.height = 230; // iOS: layout unchanged, visual viewport shrinks
  env.innerHeight = 440;
  env.fire('resize');
  env.frame(3);
  assert.equal(commits.length, 1, 'keyboard does not shrink the game');
  env.document.activeElement = null;
  env.set(440, 956);
  env.fire('orientationchange');
  env.frame(3);
  assert.deepEqual(commits.at(-1), { w: 440, h: 956, reason: 'orientation' });
  m.stop();
  assert.equal(env.listenerCount(), 0, 'stop removes every listener');
});

test('device tier and Unity support never rely on the user agent', () => {
  assert.equal(deviceTier({ webgl2: false }), 'low');
  assert.equal(deviceTier({ webgl2: true, deviceMemory: 2, cores: 6 }), 'low');
  assert.equal(deviceTier({ webgl2: true, deviceMemory: 4, cores: 6, maxTextureSize: 8192, mobile: true }), 'medium');
  assert.equal(deviceTier({ webgl2: true, deviceMemory: 8, cores: 8, maxTextureSize: 16384, mobile: false }), 'high');
  assert.equal(deviceTier({ webgl2: true, deviceMemory: 8, cores: 8, maxTextureSize: 16384, mobile: true }), 'medium');
  assert.deepEqual(supportsUnity({ webgl2: true, wasm: true }), { ok: true, reason: null });
  assert.equal(supportsUnity({ webgl1: false, webgl2: false, wasm: true }).reason, 'no_webgl');
  assert.equal(supportsUnity({ webgl2: true, wasm: false }).reason, 'no_wasm');
});
