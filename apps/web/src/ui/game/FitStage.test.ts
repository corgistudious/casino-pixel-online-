import { describe, expect, it } from 'vitest';
import { fitBox } from './FitStage';

describe('fitBox', () => {
  it('limits by height on wide stages', () => expect(fitBox(1000, 300, 1.6)).toEqual({ w: 480, h: 300 }));
  it('limits by width on tall stages', () => expect(fitBox(640, 800, 1.6)).toEqual({ w: 640, h: 400 }));
  it('handles an empty stage', () => expect(fitBox(0, 300, 1.6)).toEqual({ w: 0, h: 0 }));
});
