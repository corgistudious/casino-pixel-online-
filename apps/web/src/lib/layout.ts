import { useEffect, useState } from 'react';

/**
 * V7.1 layout switch for DOM screens: the portrait (phone) layout is used on narrow viewports and on
 * tablets held upright; desktops and landscape tablets keep the landscape layout. Live (follows
 * rotation and window resizes) through matchMedia, so no resize loop.
 */
export const PORTRAIT_LAYOUT_QUERY = '(max-width: 639px), (orientation: portrait) and (max-width: 1100px)';

export function usePortraitLayout(): boolean {
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PORTRAIT_LAYOUT_QUERY).matches;
  const [on, setOn] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(PORTRAIT_LAYOUT_QUERY);
    const update = () => setOn(mq.matches);
    mq.addEventListener?.('change', update);
    update();
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return on;
}
