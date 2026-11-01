/**
 * Device class for the orientation guard: only PCs (desktop/laptop) are exempt; phones, tablets
 * (iPad included, whatever its size) and foldables are guarded. Screen width alone never decides:
 * a narrow PC window stays a PC and a 13" iPad stays a tablet.
 *
 * Signals, strongest first:
 *  1. UA Client Hints (Chromium): `platform` is the real OS even in "desktop site" mode.
 *  2. The UA string (iPhone / iPad / Android / mobile tokens).
 *  3. iPadOS reports a Mac UA: a "Mac" with multi-touch is an iPad (real Macs report 0 touch points).
 *  4. Desktop OS tokens (Windows, macOS, Linux, ChromeOS) → PC, even with a touchscreen.
 *  5. Unknown platform: touch-only input (coarse pointer, no hover, no fine pointer at all) → mobile.
 * When a device cannot be told apart (touch laptops, 2-in-1s), it is treated as a PC so a PC user is
 * never blocked. An Android tablet driven by a mouse (Samsung DeX, desktop docks) also counts as a PC.
 */
export type DeviceClass = 'pc' | 'mobile';

export interface DeviceEnv {
  userAgent: string;
  /** navigator.userAgentData (Chromium only). */
  uaData?: { mobile?: boolean; platform?: string } | null;
  maxTouchPoints: number;
  /** matchMedia results. */
  media: { coarse: boolean; noHover: boolean; anyFine: boolean; fineHover: boolean };
}

const MOBILE_UA = /iPhone|iPod|iPad|Android|Mobile|Silk|Kindle|KFAPWI|BlackBerry|BB10|Opera Mini|IEMobile|webOS|HarmonyOS/i;
const DESKTOP_UA = /Windows NT|Macintosh|Mac OS X|X11|Linux|CrOS/i;

export function classifyDevice(env: DeviceEnv): DeviceClass {
  const ua = env.userAgent;
  const platform = env.uaData?.platform?.toLowerCase() ?? '';
  const isAndroid = platform === 'android' || /Android/i.test(ua);
  const isPhoneUa = /iPhone|iPod/i.test(ua) || (/Android/i.test(ua) && /Mobile/i.test(ua));

  if (env.uaData?.mobile === true || isPhoneUa || platform === 'ios') return 'mobile';
  if (isAndroid) {
    // Android tablets (and phones in desktop-site mode); a mouse-driven Android desktop is a PC.
    return env.media.fineHover && !env.media.coarse ? 'pc' : 'mobile';
  }
  if (/iPad/i.test(ua)) return 'mobile';
  // iPadOS 13+ "desktop" Safari/Chrome: Mac UA but multi-touch (no Mac has a touchscreen).
  if (/Macintosh/i.test(ua) && env.maxTouchPoints > 1) return 'mobile';
  if (platform && ['windows', 'macos', 'linux', 'chrome os', 'chromeos'].includes(platform)) return 'pc';
  if (MOBILE_UA.test(ua)) return 'mobile';
  if (DESKTOP_UA.test(ua)) return 'pc';
  // Unknown platform: only a touch-only device counts as mobile.
  return env.media.coarse && env.media.noHover && !env.media.anyFine ? 'mobile' : 'pc';
}

let cached: DeviceClass | null = null;

/** The current browser's class (computed once; the device does not change during a session). */
export function deviceClass(): DeviceClass {
  if (cached) return cached;
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return 'pc';
  const mq = (q: string) => (typeof window.matchMedia === 'function' ? window.matchMedia(q).matches : false);
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean; platform?: string } };
  cached = classifyDevice({
    userAgent: nav.userAgent ?? '',
    uaData: nav.userAgentData ?? null,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    media: { coarse: mq('(pointer: coarse)'), noHover: mq('(hover: none)'), anyFine: mq('(any-pointer: fine)'), fineHover: mq('(pointer: fine) and (hover: hover)') },
  });
  return cached;
}
