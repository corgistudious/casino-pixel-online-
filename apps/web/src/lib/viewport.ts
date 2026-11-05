/**
 * One controller for the on-screen keyboard and the visible viewport (iOS Safari, Chrome iOS, PWA,
 * Android). The layout never follows the visual viewport while the keyboard is closed: the app root
 * is `position: fixed; inset: 0` and the browser sizes it. Only while a text field is focused AND
 * the visible area is clearly shorter than the layout viewport (= a keyboard is up) is the app
 * height set to the visible height, so the composer / modal buttons sit just above the keyboard.
 *
 * iOS does not resize the layout viewport for the keyboard; it pans the page to reveal the field,
 * which hid the bottom of the app and made swipes fight between the pan and inner scrollers. Once
 * the app fits above the keyboard that pan is undone (scrollTo 0,0) and, only if the focused field
 * is still out of view, it is revealed once with scrollIntoView({ block: 'nearest' }).
 * If iOS also pans the visual viewport (visualViewport.offsetTop > 0, which scrollTo cannot undo),
 * the app follows it (--vvt) so it always fills exactly the area above the keyboard.
 * Android with `interactive-widget=resizes-content` already shrinks the layout viewport, so the
 * visible height equals the layout height and nothing is applied there.
 *
 * iPhone home-screen app (PWA): the app uses the window iOS gives it. When iOS opens the app with a
 * short window (see lib/viewportProbe.ts) there are two cases:
 * - 'layout-short': WebKit's large viewport (100lvh) still spans the screen, i.e. the web view covers
 *   the strip and only the layout viewport is short. The root is then sized to 100lvh (class
 *   vp-fill-lvh, a CSS unit, no px lock) so the app paints the strip instead of the page background.
 * - 'window-short': the web view itself is short. Nothing inside the page can paint there and sizing
 *   past it would push the bottom controls out of sight, so it is never done. WebKit is asked to
 *   re-read the viewport meta at most MAX_NUDGES times per launch / rotation / resume (a no-op flag
 *   toggled; no reload, no polling), and the condition is reported (StandaloneInsetHint).
 *
 * Scale-based renderers (the lobby Stage, Phaser game rooms) must NOT follow the keyboard: the app
 * root fitting above the keyboard used to make them re-measure a shorter box and shrink the whole
 * game, then snap back on close. They size themselves with useStableSize(), which ignores a
 * height-only shrink while `keyboard-open` is set (their bottom is clipped behind the keyboard
 * instead) and accepts every width change (a real rotation / window resize) immediately.
 * DOM surfaces (pages, forms, dialogs) keep fitting the visible area so inputs stay reachable.
 *
 * Updates are coalesced to one per animation frame and only written when the value changes.
 */
import { useLayoutEffect, useState, type RefObject } from 'react';
import { classifyBand, isLandscapeNow, isStandalone, measureLvh, shouldFillLvh } from './viewportProbe';

/**
 * Bounded log of what the controller decided (lvh fill on/off, viewport nudges), for the diagnostics
 * overlay. Never contains anything but sizes and timestamps.
 */
export interface ViewportEvent { t: number; what: string }
const LOG_MAX = 24;
export const viewportEvents: ViewportEvent[] = [];
function logVp(what: string) {
  viewportEvents.push({ t: Math.round(typeof performance !== 'undefined' ? performance.now() : 0), what });
  if (viewportEvents.length > LOG_MAX) viewportEvents.splice(0, viewportEvents.length - LOG_MAX);
}

/** At most this many viewport re-evaluations (meta nudges) per launch / resume / rotation. */
export const MAX_NUDGES = 2;
const NUDGE_DELAY_MS = 350;
const NUDGE_FLAG = 'shrink-to-fit=no';

/** Pure: the viewport meta content with the harmless no-op flag toggled (forces WebKit to re-read it). */
export function toggledViewportContent(content: string): string {
  const parts = content.split(',').map((x) => x.trim()).filter(Boolean);
  const i = parts.indexOf(NUDGE_FLAG);
  if (i >= 0) parts.splice(i, 1);
  else parts.push(NUDGE_FLAG);
  return parts.join(', ');
}
const KEYBOARD_MIN_PX = 120;
const TEXT_INPUTS = new Set(['text', 'search', 'email', 'password', 'tel', 'url', 'number', 'date', 'datetime-local', 'time', 'month', 'week']);

export function isTextField(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  return el.tagName === 'INPUT' && TEXT_INPUTS.has((el as HTMLInputElement).type || 'text');
}

/** Pure decision: is a keyboard up, and which height should the app use (null = let CSS decide). */
export function keyboardState(layoutHeight: number, visibleHeight: number, fieldFocused: boolean): { open: boolean; appHeight: number | null } {
  const open = fieldFocused && layoutHeight - visibleHeight > KEYBOARD_MIN_PX;
  return { open, appHeight: open ? Math.round(visibleHeight) : null };
}

/**
 * Pure: where the app sits while the keyboard is up, in layout-viewport px (null = closed, CSS
 * decides). The root is position: fixed, i.e. placed in the LAYOUT viewport, while the player sees
 * the VISUAL viewport, which iOS may pan down by `offsetTop` when a field takes focus (window.scrollTo
 * cannot undo that pan). With the root kept at top 0 the visible area would show the root shifted up
 * and `offsetTop` px of empty page — a black band — under it. So the root follows the visual
 * viewport: top = offsetTop, height = visible height. When iOS does not pan (offsetTop 0) this is
 * exactly the previous behaviour.
 */
export function keyboardFrame(layoutHeight: number, visibleHeight: number, offsetTop: number, fieldFocused: boolean): { open: boolean; top: number; height: number; kb: number } | null {
  const { open, appHeight } = keyboardState(layoutHeight, visibleHeight, fieldFocused);
  if (!open || appHeight === null) return null;
  const top = Math.max(0, Math.round(offsetTop));
  return { open, top, height: appHeight, kb: Math.max(0, Math.round(layoutHeight - top - appHeight)) };
}

export interface Box {
  w: number;
  h: number;
}

/**
 * Pure: the box a scale-based renderer should lay out in. While the keyboard is up, a shrink that
 * only changes the height (the app fitting above the keyboard) keeps the previous box; any width
 * change (rotation, window resize) or growth is taken as is. With the keyboard closed, always `next`.
 */
export function stableBox(prev: Box | null, next: Box, keyboardOpen: boolean): Box {
  if (!prev || !keyboardOpen) return next;
  if (Math.abs(next.w - prev.w) > 1) return next;
  return next.h >= prev.h ? next : prev;
}

/** Whether the controller currently reports an on-screen keyboard (set in the same frame as --vvh). */
export function keyboardOpenNow(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('keyboard-open');
}

/** The element's size for a scale-based renderer (see stableBox). null until first measured. */
export function useStableSize(ref: RefObject<HTMLElement | null>): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last: Box | null = null;
    const update = () => {
      const next = { w: el.clientWidth, h: el.clientHeight };
      if (!next.w || !next.h) return;
      const b = stableBox(last, next, keyboardOpenNow());
      if (last && b.w === last.w && b.h === last.h) return; // no re-render, no resize loop
      last = b;
      setBox(b);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

export function installViewport(): () => void {
  if (typeof window === 'undefined') return () => {};
  const vv = window.visualViewport;
  const root = document.documentElement;
  let frame = 0;
  let lastFrame = '';
  let lastOpen = false;
  let revealed: Element | null = null;
  let filled = false;
  let nudges = 0;
  let nudgeTimer = 0;
  const iphone = /iPhone|iPod/.test(navigator.userAgent);

  /**
   * iPhone home-screen app, landscape, keyboard closed: when the window is short, either fill the
   * root to 100lvh (the strip is inside the web view: 'layout-short') or, for a strip outside it
   * ('window-short'), ask WebKit to re-read the viewport a bounded number of times. Both are cheap
   * and do nothing on every other platform (the first check returns before any measurement).
   */
  const checkShortWindow = (open: boolean) => {
    const standalone = iphone && isStandalone();
    const landscape = standalone && isLandscapeNow();
    const short = Math.min(screen.width, screen.height);
    const candidate = landscape && !open && short > 0 && window.innerHeight < short - 20;
    const lvh = candidate ? measureLvh() : null;
    const env = { landscape, screenW: screen.width, screenH: screen.height, innerHeight: window.innerHeight, visualHeight: vv ? vv.height : null, lvh };
    const fill = candidate && shouldFillLvh({ ...env, standalone, iphone, keyboardOpen: open });
    if (fill !== filled) {
      filled = fill;
      root.classList.toggle('vp-fill-lvh', fill);
      logVp(`fill-lvh ${fill ? 'on' : 'off'} inner ${window.innerHeight} lvh ${lvh ?? '-'}`);
    }
    if (candidate && !fill && classifyBand(env).verdict === 'window-short' && nudges < MAX_NUDGES && !nudgeTimer) {
      nudgeTimer = window.setTimeout(() => {
        nudgeTimer = 0;
        if (window.innerHeight >= Math.min(screen.width, screen.height) - 20) return; // fixed itself
        const meta = document.querySelector('meta[name="viewport"]');
        const content = meta?.getAttribute('content');
        if (!meta || !content) return;
        nudges += 1;
        meta.setAttribute('content', toggledViewportContent(content));
        logVp(`nudge ${nudges} inner ${window.innerHeight}`);
        schedule();
      }, NUDGE_DELAY_MS);
    }
  };
  /** A new launch phase (rotation, resume, bfcache restore) gets a fresh, still bounded, budget. */
  const resetBudget = () => {
    nudges = 0;
    schedule();
  };

  const reveal = (el: HTMLElement, top: number, visible: number) => {
    if (revealed === el) return;
    const r = el.getBoundingClientRect(); // layout-viewport px, like top
    if (r.top >= top && r.bottom <= top + visible - 4) {
      revealed = el;
      return;
    }
    revealed = el;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const apply = () => {
    frame = 0;
    const active = document.activeElement;
    const focused = isTextField(active);
    const layout = root.clientHeight; // layout viewport: unaffected by the iOS keyboard
    const visible = vv ? vv.height : layout;
    const frameNow = keyboardFrame(layout, visible, vv ? vv.offsetTop : 0, focused);
    const open = frameNow !== null;
    if (open !== lastOpen) {
      root.classList.toggle('keyboard-open', open);
      lastOpen = open;
      if (!open) revealed = null;
    }
    const key = frameNow ? `${frameNow.top}/${frameNow.height}/${frameNow.kb}` : '';
    if (key !== lastFrame) {
      if (!frameNow) {
        root.style.removeProperty('--vvh');
        root.style.removeProperty('--vvt');
        root.style.removeProperty('--kb');
      } else {
        root.style.setProperty('--vvh', `${frameNow.height}px`);
        root.style.setProperty('--vvt', `${frameNow.top}px`);
        root.style.setProperty('--kb', `${frameNow.kb}px`);
      }
      lastFrame = key;
    }
    // Undo the browser's page pan once the app fits above the keyboard, or once no field is focused
    // (a pan left behind after the keyboard closed / after returning from the background). While a
    // field is focused but the keyboard is still animating in, iOS is mid-pan: leave it alone.
    // The document itself never scrolls in this app.
    if ((open || !focused) && (window.scrollX !== 0 || window.scrollY !== 0)) window.scrollTo(0, 0);
    if (frameNow && focused) reveal(active, frameNow.top, visible);
    checkShortWindow(open);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(apply);
  };
  const onFocusOut = () => {
    revealed = null;
    schedule();
  };
  const onVisible = () => document.visibilityState === 'visible' && resetBudget();

  vv?.addEventListener('resize', schedule);
  vv?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', resetBudget);
  window.addEventListener('pageshow', resetBudget);
  window.addEventListener('scroll', schedule, { passive: true });
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', onFocusOut);
  document.addEventListener('visibilitychange', onVisible);
  schedule();

  return () => {
    if (frame) cancelAnimationFrame(frame);
    if (nudgeTimer) window.clearTimeout(nudgeTimer);
    vv?.removeEventListener('resize', schedule);
    vv?.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', resetBudget);
    window.removeEventListener('pageshow', resetBudget);
    window.removeEventListener('scroll', schedule);
    document.removeEventListener('focusin', schedule);
    document.removeEventListener('focusout', onFocusOut);
    document.removeEventListener('visibilitychange', onVisible);
    root.classList.remove('keyboard-open', 'vp-fill-lvh');
    root.style.removeProperty('--vvh');
    root.style.removeProperty('--vvt');
    root.style.removeProperty('--kb');
  };
}
