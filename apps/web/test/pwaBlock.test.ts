import { describe, expect, it } from 'vitest';
import { DEFAULT_PWA_URL, isInstalledApp, mergePolicy, policyFromFlag, pwaPlatform, shouldBlock } from '../src/lib/pwaBlock';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipadLegacy: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  androidReduced: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
};
const tab = { navigatorStandalone: undefined, displayStandalone: false, displayFullscreen: false, fullscreenApi: false };

describe('pwaPlatform', () => {
  it('iPhone, iPad (both UA styles) → ios; Android → android; desktops → other', () => {
    expect(pwaPlatform({ userAgent: UA.iphone, maxTouchPoints: 5 })).toBe('ios');
    expect(pwaPlatform({ userAgent: UA.ipadLegacy, maxTouchPoints: 5 })).toBe('ios');
    expect(pwaPlatform({ userAgent: UA.ipadDesktop, maxTouchPoints: 5 })).toBe('ios');
    expect(pwaPlatform({ userAgent: UA.android, maxTouchPoints: 5 })).toBe('android');
    expect(pwaPlatform({ userAgent: UA.androidReduced, uaPlatform: 'Android', maxTouchPoints: 5 })).toBe('android');
    // Android in "desktop site" mode still reports its platform through UA Client Hints.
    expect(pwaPlatform({ userAgent: UA.windows, uaPlatform: 'Android', maxTouchPoints: 5 })).toBe('android');
    expect(pwaPlatform({ userAgent: UA.windows, uaPlatform: 'Windows', maxTouchPoints: 10 })).toBe('other');
    expect(pwaPlatform({ userAgent: UA.mac, maxTouchPoints: 0 })).toBe('other');
  });
});

describe('isInstalledApp', () => {
  it('iOS home-screen app, display-mode standalone / fullscreen → installed', () => {
    expect(isInstalledApp({ ...tab, navigatorStandalone: true })).toBe(true);
    expect(isInstalledApp({ ...tab, displayStandalone: true })).toBe(true);
    expect(isInstalledApp({ ...tab, displayFullscreen: true })).toBe(true);
  });
  it('normal tabs are never "installed"', () => {
    expect(isInstalledApp(tab)).toBe(false);
    // Safari tab on iOS: navigator.standalone exists and is false.
    expect(isInstalledApp({ ...tab, navigatorStandalone: false })).toBe(false);
    // A tab using the Fullscreen API (e.g. a video) is not the installed app.
    expect(isInstalledApp({ ...tab, displayFullscreen: true, fullscreenApi: true })).toBe(false);
  });
});

describe('policy', () => {
  it('build flag: default blocks iOS and Android; off / ios / android', () => {
    expect(policyFromFlag(undefined, undefined)).toEqual({ ios: true, android: true, url: DEFAULT_PWA_URL });
    expect(policyFromFlag('', undefined)).toEqual({ ios: true, android: true, url: DEFAULT_PWA_URL });
    expect(policyFromFlag('typo', undefined)).toEqual({ ios: true, android: true, url: DEFAULT_PWA_URL });
    expect(policyFromFlag('off', undefined)).toMatchObject({ ios: false, android: false });
    expect(policyFromFlag('IOS', undefined)).toMatchObject({ ios: true, android: false });
    expect(policyFromFlag('android', undefined)).toMatchObject({ ios: false, android: true });
    expect(policyFromFlag('all', 'https://test.play.keyogame.com/').url).toBe('https://test.play.keyogame.com');
    expect(policyFromFlag('all', 'http://insecure.example').url).toBe(DEFAULT_PWA_URL);
    expect(policyFromFlag('all', 'javascript:alert(1)').url).toBe(DEFAULT_PWA_URL);
  });
  it('runtime override: only well-typed fields count, anything else keeps the build policy', () => {
    const base = policyFromFlag('all', undefined);
    expect(mergePolicy(base, { ios: false, android: false })).toEqual({ ios: false, android: false, url: DEFAULT_PWA_URL });
    expect(mergePolicy(base, { android: false })).toEqual({ ios: true, android: false, url: DEFAULT_PWA_URL });
    expect(mergePolicy(base, { ios: 'false', android: 0 })).toEqual(base);
    expect(mergePolicy(base, null)).toEqual(base);
    expect(mergePolicy(base, '<!doctype html>')).toEqual(base);
    expect(mergePolicy(base, [false])).toEqual(base);
    expect(mergePolicy(base, { url: 'https://play.keyogame.com/' }).url).toBe('https://play.keyogame.com');
    expect(mergePolicy(base, { url: 'http://evil.example' }).url).toBe(DEFAULT_PWA_URL);
  });
  it('decision: installed iOS/Android app per policy; tabs and PCs never', () => {
    const all = policyFromFlag(undefined, undefined);
    expect(shouldBlock(all, 'ios', true)).toBe(true);
    expect(shouldBlock(all, 'android', true)).toBe(true);
    expect(shouldBlock(all, 'other', true)).toBe(false);
    expect(shouldBlock(all, 'ios', false)).toBe(false);
    expect(shouldBlock(all, 'android', false)).toBe(false);
    const iosOnly = policyFromFlag('ios', undefined);
    expect(shouldBlock(iosOnly, 'android', true)).toBe(false);
    expect(shouldBlock(policyFromFlag('off', undefined), 'ios', true)).toBe(false);
  });
});
