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
 * Android with `interactive-widget=resizes-content` already shrinks the layout viewport, so the
 * visible height equals the layout height and nothing is applied there.
 *
 * Updates are coalesced to one per animation frame and only written when the value changes.
 */
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

export function installViewport(): () => void {
  if (typeof window === 'undefined') return () => {};
  const vv = window.visualViewport;
  const root = document.documentElement;
  let frame = 0;
  let lastHeight: number | null = null;
  let lastOpen = false;
  let revealed: Element | null = null;

  const reveal = (el: HTMLElement, visible: number) => {
    if (revealed === el) return;
    const r = el.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= visible - 4) {
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
    const { open, appHeight } = keyboardState(layout, visible, focused);
    if (open !== lastOpen) {
      root.classList.toggle('keyboard-open', open);
      lastOpen = open;
      if (!open) revealed = null;
    }
    if (appHeight !== lastHeight) {
      if (appHeight === null) {
        root.style.removeProperty('--vvh');
        root.style.removeProperty('--kb');
      } else {
        root.style.setProperty('--vvh', `${appHeight}px`);
        root.style.setProperty('--kb', `${Math.max(0, layout - appHeight)}px`);
      }
      lastHeight = appHeight;
    }
    // Undo the browser's page pan once the app fits above the keyboard, or once no field is focused
    // (a pan left behind after the keyboard closed / after returning from the background). While a
    // field is focused but the keyboard is still animating in, iOS is mid-pan: leave it alone.
    // The document itself never scrolls in this app.
    if ((open || !focused) && (window.scrollX !== 0 || window.scrollY !== 0)) window.scrollTo(0, 0);
    if (open && focused) reveal(active, visible);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(apply);
  };
  const onFocusOut = () => {
    revealed = null;
    schedule();
  };
  const onVisible = () => document.visibilityState === 'visible' && schedule();

  vv?.addEventListener('resize', schedule);
  vv?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.addEventListener('pageshow', schedule);
  window.addEventListener('scroll', schedule, { passive: true });
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', onFocusOut);
  document.addEventListener('visibilitychange', onVisible);
  schedule();

  return () => {
    if (frame) cancelAnimationFrame(frame);
    vv?.removeEventListener('resize', schedule);
    vv?.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    window.removeEventListener('pageshow', schedule);
    window.removeEventListener('scroll', schedule);
    document.removeEventListener('focusin', schedule);
    document.removeEventListener('focusout', onFocusOut);
    document.removeEventListener('visibilitychange', onVisible);
    root.classList.remove('keyboard-open');
    root.style.removeProperty('--vvh');
    root.style.removeProperty('--kb');
  };
}
