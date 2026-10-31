import {describe, expect, it} from 'vitest';
import {
  SMALL_VIEWPORT_THRESHOLD_PX,
  clampWindowAnchor,
  getBaseWindowSecs,
  getWindowSecs,
} from './rowWaveform';

describe('getBaseWindowSecs', () => {
  const cases: Array<[number, number]> = [
    [400, 12],
    [799, 12],
    [800, 12],
    [1199, 12],
    [1200, 16],
    [1599, 16],
    [1600, 32],
    [2560, 32],
  ];

  it.each(cases)(
    'width %s gives a base window of %s seconds',
    (width, expected) => {
      expect(getBaseWindowSecs(width)).toBe(expected);
    },
  );
});

describe('getWindowSecs', () => {
  it('renders a minimum-length clip at 27px above the small-screen threshold', () => {
    for (const width of [600, 900, 1200, 1600]) {
      for (const minimum of [0.3, 0.5, 1]) {
        const seconds = getWindowSecs(width, minimum);
        expect((width * minimum) / seconds).toBeCloseTo(27, 8);
      }
    }
  });

  it('keeps small screens at the time window of the 600px reference width', () => {
    for (const minimum of [0.3, 0.5, 1]) {
      const reference = getWindowSecs(600, minimum);
      for (const width of [-100, 0, 120, 360, 599]) {
        expect(getWindowSecs(width, minimum)).toBe(reference);
      }
    }
  });

  it('responds proportionally when the configured minimum changes', () => {
    expect(getWindowSecs(600, 0.3)).toBeCloseTo(6.66666667, 7);
    expect(getWindowSecs(1200, 0.3)).toBeCloseTo(13.33333333, 7);
    expect(getWindowSecs(1200, 0.6)).toBeCloseTo(
      getWindowSecs(1200, 0.3) * 2,
      8,
    );
  });

  it('is continuous across the small-screen threshold', () => {
    expect(SMALL_VIEWPORT_THRESHOLD_PX).toBe(600);
    const at = getWindowSecs(600, 0.3);
    expect(getWindowSecs(599, 0.3)).toBe(at);
    expect(getWindowSecs(601, 0.3)).toBeCloseTo(at + 0.3 / 27, 8);
  });
});

describe('clampWindowAnchor', () => {
  const cases: Array<[number, number, number]> = [
    [0, 40, 0],
    [10, 40, 10],
    [45, 40, 40],
    [-5, 40, 0],
  ];

  it.each(cases)(
    'clamps anchor %s using maxStart %s to %s',
    (anchor, maxStart, expected) => {
      expect(clampWindowAnchor(anchor, maxStart)).toBe(expected);
    },
  );
});
