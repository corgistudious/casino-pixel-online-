import { describe, expect, it } from 'vitest';
import { canOfferFullscreen } from './fullscreen';

const base = { enabled: true, webkitEnabled: false, userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130', installedApp: false };
describe('canOfferFullscreen', () => {
  it('offers on Android/desktop browsers with the Fullscreen API', () => expect(canOfferFullscreen(base)).toBe(true));
  it('offers on iPadOS (webkit-prefixed)', () => expect(canOfferFullscreen({ ...base, enabled: false, webkitEnabled: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0) Safari' })).toBe(true));
  it('never on iPhone', () => expect(canOfferFullscreen({ ...base, webkitEnabled: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari' })).toBe(false));
  it('never when unsupported', () => expect(canOfferFullscreen({ ...base, enabled: false })).toBe(false));
  it('never inside the installed app', () => expect(canOfferFullscreen({ ...base, installedApp: true })).toBe(false));
});
