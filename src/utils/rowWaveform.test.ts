import {describe, expect, it} from 'vitest';
import {
  MIN_WINDOW_SECS,
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
  /*
   * Above SMALL_VIEWPORT_THRESHOLD_PX the ideal 120px-per-second scale
   * applies: windowSecs = width * 0.2 / 24. A 1-second clip is rendered
   * 120px wide everywhere in this regime — consistent visual size.
   */
  const linearCases: Array<[number, number]> = [
    // [width, expected seconds]
    [SMALL_VIEWPORT_THRESHOLD_PX, 5],
    [600, 5],
    [1200, 10],
    [1600, 13.3333],
  ];

  it.each(linearCases)(
    'width %spx (>= threshold) → %ss of audio at 120px/s',
    (width, expected) => {
      expect(getWindowSecs(width)).toBeCloseTo(expected, 4);
    },
  );

  /*
   * Below SMALL_VIEWPORT_THRESHOLD_PX the window is held at MIN_WINDOW_SECS
   * so small screens still show ~5 seconds of audio. The px-per-second
   * ratio drops as the viewport shrinks (1s = 80px at 400px, 72px at 360px).
   */
  const smallScreenCases: Array<[number, number]> = [
    // [width, expected seconds (always MIN_WINDOW_SECS)]
    [0, MIN_WINDOW_SECS],
    [120, MIN_WINDOW_SECS],
    [240, MIN_WINDOW_SECS],
    [360, MIN_WINDOW_SECS],
    [400, MIN_WINDOW_SECS],
    [599, MIN_WINDOW_SECS],
  ];

  it.each(smallScreenCases)(
    'width %spx (< threshold) → held at MIN_WINDOW_SECS (%ss)',
    (width, expected) => {
      expect(getWindowSecs(width)).toBe(expected);
      expect(getWindowSecs(width)).toBe(MIN_WINDOW_SECS);
    },
  );

  /*
   * Continuity: at the threshold itself, the two regimes agree — both the
   * linear formula and the floor give 5s. This avoids a visual jump when
   * the viewport is resized across the boundary.
   */
  it('is continuous at the threshold (no visual jump on resize)', () => {
    const justBelow = getWindowSecs(SMALL_VIEWPORT_THRESHOLD_PX - 1);
    const at = getWindowSecs(SMALL_VIEWPORT_THRESHOLD_PX);
    const justAbove = getWindowSecs(SMALL_VIEWPORT_THRESHOLD_PX + 1);

    expect(justBelow).toBeCloseTo(at, 4);
    expect(at).toBeCloseTo(5, 4);
    expect(justAbove).toBeCloseTo(at + 1 / 120, 4);
  });

  it('scales linearly with width above the threshold', () => {
    const at600 = getWindowSecs(600);
    const at1200 = getWindowSecs(1200);

    expect(at1200).toBeCloseTo(at600 * 2, 4);
  });

  it('is purely a function of width (no hysteresis, deterministic)', () => {
    expect(getWindowSecs(600)).toBe(getWindowSecs(600));
    expect(getWindowSecs(400)).toBe(getWindowSecs(400));
    expect(getWindowSecs(600)).toBeCloseTo(5, 4);
    expect(getWindowSecs(400)).toBeCloseTo(5, 4);
  });

  it('never returns less than MIN_WINDOW_SECS', () => {
    expect(getWindowSecs(0)).toBeGreaterThanOrEqual(MIN_WINDOW_SECS);
    expect(getWindowSecs(100)).toBeGreaterThanOrEqual(MIN_WINDOW_SECS);
    expect(getWindowSecs(300)).toBeGreaterThanOrEqual(MIN_WINDOW_SECS);
    expect(getWindowSecs(599)).toBeGreaterThanOrEqual(MIN_WINDOW_SECS);
  });

  it('never returns less than 0', () => {
    expect(getWindowSecs(0)).toBeGreaterThanOrEqual(0);
    expect(getWindowSecs(-100)).toBeGreaterThanOrEqual(0);
  });
});

describe('constants', () => {
  it('exposes the threshold and floor for callers and tests', () => {
    expect(SMALL_VIEWPORT_THRESHOLD_PX).toBe(600);
    expect(MIN_WINDOW_SECS).toBeCloseTo(5, 4);
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
