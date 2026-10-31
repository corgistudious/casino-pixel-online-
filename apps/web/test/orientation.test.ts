import { describe, expect, it } from 'vitest';
import { classifyDevice, type DeviceEnv } from '../src/lib/device';
import { readOrientation, requiredOrientation } from '../src/lib/orientation';

const touch = { coarse: true, noHover: true, anyFine: false, fineHover: false };
const mouse = { coarse: false, noHover: false, anyFine: true, fineHover: true };
const touchLaptop = { coarse: false, noHover: false, anyFine: true, fineHover: true };
const env = (userAgent: string, over: Partial<DeviceEnv> = {}): DeviceEnv => ({ userAgent, uaData: null, maxTouchPoints: 0, media: mouse, ...over });

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  androidPhone: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  androidReduced: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  samsungFold: 'Mozilla/5.0 (Linux; Android 14; SM-F956B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  ipadDesktopSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  ipadLegacy: 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1',
  ipadChrome: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  linuxDesktop: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  chromebook: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

describe('classifyDevice', () => {
  it('guards phones on every browser', () => {
    expect(classifyDevice(env(UA.iphoneSafari, { maxTouchPoints: 5, media: touch }))).toBe('mobile');
    expect(classifyDevice(env(UA.iphoneChrome, { maxTouchPoints: 5, media: touch }))).toBe('mobile');
    expect(classifyDevice(env(UA.androidPhone, { maxTouchPoints: 5, media: touch, uaData: { mobile: true, platform: 'Android' } }))).toBe('mobile');
    expect(classifyDevice(env(UA.androidReduced, { maxTouchPoints: 5, media: touch }))).toBe('mobile');
    expect(classifyDevice(env(UA.firefoxAndroid, { maxTouchPoints: 5, media: touch }))).toBe('mobile');
    expect(classifyDevice(env(UA.samsungFold, { maxTouchPoints: 10, media: touch }))).toBe('mobile');
  });

  it('guards tablets however large: iPad (incl. desktop-mode Safari/Chrome) and Android tablets', () => {
    expect(classifyDevice(env(UA.ipadDesktopSafari, { maxTouchPoints: 5, media: touch }))).toBe('mobile');
    expect(classifyDevice(env(UA.ipadLegacy, { maxTouchPoints: 5, media: touch }))).toBe('mobile');
    expect(classifyDevice(env(UA.ipadChrome, { maxTouchPoints: 5, media: touch }))).toBe('mobile');
    // iPad with a Magic Keyboard/trackpad attached is still an iPad.
    expect(classifyDevice(env(UA.ipadDesktopSafari, { maxTouchPoints: 5, media: mouse }))).toBe('mobile');
    expect(classifyDevice(env(UA.androidTablet, { maxTouchPoints: 10, media: touch, uaData: { mobile: false, platform: 'Android' } }))).toBe('mobile');
    // Android "Request desktop site": UA looks like Linux, client hints still say Android.
    expect(classifyDevice(env(UA.linuxDesktop, { maxTouchPoints: 5, media: touch, uaData: { mobile: false, platform: 'Android' } }))).toBe('mobile');
  });

  it('never guards PCs: Windows, Mac, Linux, ChromeOS, with or without a touchscreen', () => {
    expect(classifyDevice(env(UA.winChrome, { uaData: { mobile: false, platform: 'Windows' } }))).toBe('pc');
    expect(classifyDevice(env(UA.macSafari))).toBe('pc');
    expect(classifyDevice(env(UA.linuxDesktop))).toBe('pc');
    expect(classifyDevice(env(UA.chromebook, { uaData: { mobile: false, platform: 'Chrome OS' } }))).toBe('pc');
    // Touchscreen laptop / 2-in-1: unsure → do not block the PC user.
    expect(classifyDevice(env(UA.winChrome, { maxTouchPoints: 10, media: touchLaptop, uaData: { mobile: false, platform: 'Windows' } }))).toBe('pc');
    expect(classifyDevice(env(UA.winChrome, { maxTouchPoints: 10, media: touch }))).toBe('pc');
  });

  it('treats a mouse-driven Android desktop (DeX) as a PC and unknown platforms by input type', () => {
    expect(classifyDevice(env(UA.linuxDesktop, { maxTouchPoints: 10, media: mouse, uaData: { mobile: false, platform: 'Android' } }))).toBe('pc');
    expect(classifyDevice(env('SomeBrowser/1.0', { media: touch }))).toBe('mobile');
    expect(classifyDevice(env('SomeBrowser/1.0', { media: mouse }))).toBe('pc');
  });
});

describe('readOrientation', () => {
  it('prefers the physical screen orientation over the viewport (keyboard-safe)', () => {
    // Typing in portrait: the keyboard makes the viewport wide, but the screen is still portrait.
    expect(readOrientation({ screenType: 'portrait-primary', mediaPortrait: false })).toBe('portrait');
    expect(readOrientation({ screenType: 'landscape-secondary', mediaPortrait: true })).toBe('landscape');
    expect(readOrientation({ screenType: null, legacyAngle: 90, mediaPortrait: true })).toBe('landscape');
    expect(readOrientation({ screenType: null, legacyAngle: 180, mediaPortrait: false })).toBe('portrait');
    expect(readOrientation({ mediaPortrait: true })).toBe('portrait');
    expect(readOrientation({ mediaPortrait: false })).toBe('landscape');
  });
});

describe('requiredOrientation', () => {
  it('auth screens are portrait; lobby, rooms and signed-in features are landscape', () => {
    expect(requiredOrientation({ signedIn: false, verified: false, pathname: '/' })).toBe('portrait');
    expect(requiredOrientation({ signedIn: false, verified: false, pathname: '/cards/poker-1' })).toBe('portrait');
    expect(requiredOrientation({ signedIn: true, verified: false, pathname: '/' })).toBe('portrait');
    expect(requiredOrientation({ signedIn: true, verified: true, pathname: '/reset-password' })).toBe('portrait');
    expect(requiredOrientation({ signedIn: false, verified: false, pathname: '/activate' })).toBe('portrait');
    expect(requiredOrientation({ signedIn: true, verified: true, pathname: '/' })).toBe('landscape');
    expect(requiredOrientation({ signedIn: true, verified: true, pathname: '/tables/taixiu-1' })).toBe('landscape');
    expect(requiredOrientation({ signedIn: true, verified: true, pathname: '/settings' })).toBe('landscape');
    expect(requiredOrientation({ signedIn: true, verified: true, pathname: '/admin/items' })).toBe('landscape');
  });
});
