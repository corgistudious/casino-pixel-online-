/**
 * Keyo Viewport Manager — browser side (shipped with the Unity WebGL template; tested by
 * apps/unity-webgl/web-tests with Node). Decides WHICH size the Unity canvas uses and WHEN.
 *
 * Rules (from the iOS PWA / keyboard investigations, docs/IOS_PWA_LANDSCAPE_STARTUP.md, V6.4):
 * - Never commit an unverified size: after any trigger, sample once per frame and commit only when
 *   SETTLE_FRAMES consecutive samples agree (±1 px). Sampling is bounded (MAX_FRAMES); when it ends the
 *   last sample is committed, so a stale size is never kept.
 * - After resume / rotation, re-verify on a short bounded schedule (iOS applies late changes).
 * - A height-only shrink while a text field is focused is the on-screen keyboard: the game keeps its
 *   size (V6.4 rule). Any width change is a real resize and always applies.
 * - It measures the window / visualViewport and only writes the canvas, so writes never feed back:
 *   no resize loop. A commit happens only when the committed value changes.
 * - It cannot paint outside the window iOS gives the page; it reports what it measured.
 */
export const SETTLE_FRAMES = 3;
export const MAX_FRAMES = 45;
export const RECHECK_MS = [120, 400, 1000, 2500];

export function sameSize(a, b, tol = 1) {
  return !!a && !!b && Math.abs(a.w - b.w) <= tol && Math.abs(a.h - b.h) <= tol;
}

/** V6.4 rule: while the keyboard is up, a height-only shrink keeps the previous box. */
export function stableBox(prev, next, keyboardOpen) {
  if (!prev || !keyboardOpen) return next;
  if (Math.abs(next.w - prev.w) > 1) return next;
  return next.h >= prev.h ? next : prev;
}

/** Render buffer size for a CSS size, with the quality tier's device-pixel-ratio cap. */
export function renderSize(css, dpr, cap) {
  const ratio = Math.max(1, Math.min(dpr || 1, cap || 1));
  return { w: Math.round(css.w * ratio), h: Math.round(css.h * ratio), ratio };
}

/** Initial quality tier from capabilities (never from the user agent alone). AUTO refines it in C# from frame times. */
export function deviceTier(caps) {
  if (!caps.webgl2) return 'low';
  const mem = caps.deviceMemory ?? 4;
  const cores = caps.cores ?? 4;
  const maxTex = caps.maxTextureSize ?? 4096;
  if (mem <= 2 || cores <= 2 || maxTex < 4096) return 'low';
  if (mem >= 8 && cores >= 8 && maxTex >= 8192 && !caps.mobile) return 'high';
  return 'medium';
}

/** Whether Unity WebGL should load at all; otherwise the React frontend stays (fallback). */
export function supportsUnity(caps) {
  if (!caps.webgl2 && !caps.webgl1) return { ok: false, reason: 'no_webgl' };
  if (!caps.wasm) return { ok: false, reason: 'no_wasm' };
  if ((caps.deviceMemory ?? 4) < 1) return { ok: false, reason: 'low_memory' };
  return { ok: true, reason: null };
}

/**
 * Pure settle machine: feed one sample per frame; returns the size to commit, or null.
 * `start()` begins a sampling window (called on every trigger).
 */
export function createStabilizer({ settleFrames = SETTLE_FRAMES, maxFrames = MAX_FRAMES } = {}) {
  let last = null;
  let streak = 0;
  let frames = 0;
  let active = false;
  return {
    get active() {
      return active;
    },
    start() {
      active = true;
      frames = 0;
      streak = 0;
      last = null;
    },
    /** @returns {{w:number,h:number}|null} size to commit now (sampling ends) */
    push(sample) {
      if (!active) return null;
      frames++;
      streak = sameSize(sample, last) ? streak + 1 : 1;
      last = sample;
      if (streak >= settleFrames || frames >= maxFrames) {
        active = false;
        return sample;
      }
      return null;
    },
  };
}

const TEXT_TYPES = new Set(['text', 'search', 'email', 'password', 'tel', 'url', 'number']);
function isTextField(el) {
  if (!el || !el.tagName) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && TEXT_TYPES.has((el.type || 'text').toLowerCase());
}

/**
 * Browser controller. `env` is window-like (injectable for tests); `onCommit(size)` applies a verified
 * CSS size ({w,h,safe,reason}). Returns { stop, trigger, committed }.
 */
export function installViewportManager({ env = globalThis, onCommit, settleFrames, maxFrames, recheckMs = RECHECK_MS } = {}) {
  const doc = env.document;
  const stab = createStabilizer({ settleFrames, maxFrames });
  let committed = null;
  let raf = 0;
  let reason = 'start';
  const timers = new Set();

  const sample = () => {
    const vv = env.visualViewport;
    const w = Math.round(vv ? Math.max(vv.width, env.innerWidth || 0) : env.innerWidth);
    const h = Math.round(env.innerHeight || (vv ? vv.height : 0));
    return { w, h };
  };
  const keyboardOpen = () => {
    const vv = env.visualViewport;
    return !!(vv && isTextField(doc && doc.activeElement) && (env.innerHeight || 0) - vv.height > 120);
  };
  const frame = () => {
    raf = 0;
    const s = sample();
    const done = stab.push(s);
    if (done) {
      const next = stableBox(committed, done, keyboardOpen());
      if (!sameSize(next, committed, 0)) {
        committed = { w: next.w, h: next.h };
        onCommit && onCommit({ ...committed, reason });
      }
      return;
    }
    raf = env.requestAnimationFrame(frame);
  };
  const trigger = (why) => {
    reason = why;
    stab.start();
    if (!raf) raf = env.requestAnimationFrame(frame);
  };
  const resume = (why) => {
    trigger(why);
    for (const ms of recheckMs) {
      const id = env.setTimeout(() => {
        timers.delete(id);
        trigger(why + '+' + ms);
      }, ms);
      timers.add(id);
    }
  };

  const onResize = () => trigger('resize');
  const onVv = () => trigger('vv');
  const onOrient = () => resume('orientation');
  const onShow = () => resume('pageshow');
  const onVis = () => doc && doc.visibilityState === 'visible' && resume('visible');
  const onFocus = () => resume('focus');
  env.addEventListener('resize', onResize);
  env.addEventListener('orientationchange', onOrient);
  env.addEventListener('pageshow', onShow);
  env.addEventListener('focus', onFocus);
  env.visualViewport && env.visualViewport.addEventListener('resize', onVv);
  doc && doc.addEventListener('visibilitychange', onVis);
  resume('start');

  return {
    get committed() {
      return committed;
    },
    trigger,
    stop() {
      if (raf) env.cancelAnimationFrame(raf);
      for (const id of timers) env.clearTimeout(id);
      timers.clear();
      env.removeEventListener('resize', onResize);
      env.removeEventListener('orientationchange', onOrient);
      env.removeEventListener('pageshow', onShow);
      env.removeEventListener('focus', onFocus);
      env.visualViewport && env.visualViewport.removeEventListener('resize', onVv);
      doc && doc.removeEventListener('visibilitychange', onVis);
    },
  };
}
