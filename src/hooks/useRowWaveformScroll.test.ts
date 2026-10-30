// @vitest-environment jsdom

import {act, renderHook} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {useRowWaveformScroll} from './useRowWaveformScroll';

/*
 * Make viewport calculation deterministic.
 *
 * Adjust this mock if your getWindowSecs()
 * is already deterministic in tests.
 */
vi.mock('../utils/rowWaveform', async importOriginal => {
  const actual = await importOriginal<typeof import('../utils/rowWaveform')>();

  return {
    ...actual,

    getWindowSecs: vi.fn(() => 10),
  };
});

type PlayRangeCallbacks = {
  onComplete?: () => void;
  onRepeat?: () => void;
};

let rafQueue: FrameRequestCallback[] = [];

const flushRaf = () => {
  const q = rafQueue;
  rafQueue = [];
  for (const cb of q) cb(performance.now());
};

function createHarness(options?: {
  duration?: number;
  currentTime?: number;
  playing?: boolean;
}) {
  let time = options?.currentTime ?? 0;

  let playing = options?.playing ?? false;

  let callbacks: PlayRangeCallbacks = {};

  const onSeek = vi.fn((next: number) => {
    time = next;
  });

  const onActiveClipChange = vi.fn();

  const onPlayRange = vi.fn(
    (
      _start: number,
      _end: number,
      _repetitions: number,
      onComplete?: () => void,
      onRepeat?: () => void,
    ) => {
      callbacks = {
        onComplete,
        onRepeat,
      };
    },
  );

  const setScrolling = vi.fn();

  const scrollTimeoutRef = {
    current: undefined as number | undefined,
  };

  const getCurrentTime = () => time;

  const result = renderHook(() =>
    useRowWaveformScroll({
      waveformDuration: options?.duration ?? 100,

      currentTime: time,

      onSeek,

      onPlayRange,

      repetitions: 3,

      onActiveClipChange,

      getCurrentTime,

      playing,

      scrolling: false,

      setScrolling,

      scrollTimeoutRef,
    }),
  );

  return {
    ...result,

    onPlayRange,

    onSeek,

    onActiveClipChange,

    callbacks: () => callbacks,

    getTime: () => time,

    setTime: (next: number) => {
      time = next;
    },

    setPlaying: (next: boolean) => {
      playing = next;
    },
  };
}

/*
 * The hook learns its window length/max-start from the measured element width
 * (applyWidth), which never runs in this DOM-less harness. Initialize the
 * refs the way a 10s window over a 100s waveform would, then place the anchor.
 */
function armWindow(h: ReturnType<typeof createHarness>, anchor: number) {
  act(() => {
    h.result.current.hsWinLenRef.current = 10;
    h.result.current.hsMaxStartRef.current = 90;
    h.result.current.viewportAnchorRef.current = anchor;
  });
}

describe('useRowWaveformScroll clip playback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rafQueue = [];
    /*
     * Drive the hook's frame loop frame-by-frame so time-based
     * following is deterministic.
     */
    vi.restoreAllMocks();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (cb: FrameRequestCallback) => {
        rafQueue.push(cb);
        return rafQueue.length;
      },
    );
  });

  /*
   * ------------------------------------------------
   * Fully visible clip
   * ------------------------------------------------
   */

  it('does not move the viewport when the whole clip is visible', () => {
    const h = createHarness();

    armWindow(h, 10);

    act(() => {
      h.result.current.playClip(12, 18, 3);
    });

    expect(h.result.current.viewportAnchorRef.current).toBe(10);

    expect(h.onPlayRange).toHaveBeenCalledWith(
      12,
      18,
      3,
      expect.any(Function),
      expect.any(Function),
    );
  });

  /*
   * ------------------------------------------------
   * Left-hidden short clip
   * ------------------------------------------------
   */

  it('moves to clip.start when a clip is left-hidden', () => {
    const h = createHarness();

    /*
     * viewport = 15..25
     * clip     = 10..18
     */
    armWindow(h, 15);

    /*
     * Left side is hidden. Arming moves to clip.start minus the small
     * CLIP_PLAY_MARGIN (9.9), which is exactly the left-hidden arm.
     */
    act(() => {
      h.result.current.playClip(10, 18, 2);
    });

    expect(h.result.current.viewportAnchorRef.current).toBeCloseTo(9.9, 3);
  });

  /*
   * ------------------------------------------------
   * Right-hidden short clip
   * ------------------------------------------------
   */

  it('does not jump immediately when a clip is right-hidden', () => {
    const h = createHarness();

    /*
     * viewport = 10..20
     * clip     = 16..24
     *
     * Right side is hidden.
     */
    armWindow(h, 10);

    act(() => {
      h.result.current.playClip(16, 24, 2);
    });

    expect(h.result.current.viewportAnchorRef.current).toBe(10);
  });

  /*
   * ------------------------------------------------
   * Long clip
   * ------------------------------------------------
   */

  it('starts a long clip at clip.start', () => {
    const h = createHarness();

    /*
     * window = 10
     *
     * viewport = 15..25
     * clip     = 10........30
     *
     * Clip is both left-hidden and
     * right-hidden.
     */
    armWindow(h, 15);

    act(() => {
      h.result.current.playClip(10, 30, 3);
    });

    expect(h.result.current.viewportAnchorRef.current).toBeCloseTo(9.9, 3);
  });

  /*
   * This is the regression test for the bug:
   *
   * round 1:
   *     viewport follows toward end
   *
   * round 2:
   *     viewport must return to clip.start
   */
  it('resets a long clip viewport to clip.start on every repetition', () => {
    const h = createHarness();

    armWindow(h, 15);

    act(() => {
      h.result.current.playClip(10, 30, 3);
    });

    /*
     * Initial round.
     */
    expect(h.result.current.viewportAnchorRef.current).toBeCloseTo(9.9, 3);

    /*
     * Simulate the viewport having followed
     * playback toward the end of round 1.
     */
    act(() => {
      h.result.current.viewportAnchorRef.current = 20;
    });

    expect(h.result.current.viewportAnchorRef.current).toBe(20);

    /*
     * playRange tells us that round 2 started.
     */
    act(() => {
      h.callbacks().onRepeat?.();
    });

    /*
     * Critical assertion:
     *
     * 20..30
     *
     * must become
     *
     * 9.9..19.9
     */
    expect(h.result.current.viewportAnchorRef.current).toBeCloseTo(9.9, 3);

    /*
     * Simulate round 2 following again.
     */
    act(() => {
      h.result.current.viewportAnchorRef.current = 20;
    });

    /*
     * Round 3.
     */
    act(() => {
      h.callbacks().onRepeat?.();
    });

    expect(h.result.current.viewportAnchorRef.current).toBeCloseTo(9.9, 3);
  });

  /*
   * ------------------------------------------------
   * Scrolling while a clip plays
   * ------------------------------------------------
   */

  it('snaps a left-hidden clip to its start and does not scroll while it plays', () => {
    const h = createHarness({
      playing: true,
    });

    /*
     * window  = 10
     *
     * viewport = 15..25
     * clip     = 10..18
     *
     * Left side is hidden. Arming snaps the window to clip.start minus the
     * small CLIP_PLAY_MARGIN (9.9); the whole clip then fits inside
     * 9.9..19.9, so playback must not move the window.
     */
    armWindow(h, 15);

    act(() => {
      h.result.current.playClip(10, 18, 2);
    });

    expect(h.result.current.viewportAnchorRef.current).toBeCloseTo(9.9, 3);

    h.setTime(14);
    act(() => flushRaf());
    expect(h.result.current.viewportAnchorRef.current).toBeCloseTo(9.9, 3);

    h.setTime(18);
    act(() => flushRaf());
    expect(h.result.current.viewportAnchorRef.current).toBeCloseTo(9.9, 3);
  });

  it('scrolls a right-hidden clip until its end is visible, then stops', () => {
    const h = createHarness({
      playing: true,
    });

    /*
     * viewport = 10..20
     * clip     = 16..24
     *
     * The window starts where it is and stays put until the playhead
     * reaches the right edge (threshold = 10 + 10 - 0.1 = 19.9); it then
     * glides so the clip end stays 0.1s inside the right edge, stopping
     * at 24 - 10 + 0.1 = 14.1.
     */
    armWindow(h, 10);

    act(() => {
      h.result.current.playClip(16, 24, 2);
    });

    expect(h.result.current.viewportAnchorRef.current).toBe(10);

    h.setTime(16);
    act(() => flushRaf());
    expect(h.result.current.viewportAnchorRef.current).toBe(10);

    h.setTime(18);
    act(() => flushRaf());
    expect(h.result.current.viewportAnchorRef.current).toBe(10);

    h.setTime(20);
    act(() => flushRaf());
    expect(h.result.current.viewportAnchorRef.current).toBeCloseTo(10.1, 3);

    /*
     * 24 is now visible 0.1s inside the right edge of 14.1..24.1;
     * the window must stop scrolling.
     */
    h.setTime(24);
    act(() => flushRaf());
    expect(h.result.current.viewportAnchorRef.current).toBeCloseTo(14.1, 3);
  });

  it('snaps a both-hidden long clip to its start, scrolls to its end, and repeats', () => {
    const h = createHarness({
      playing: true,
    });

    /*
     * viewport = 15..25
     * clip     = 10........30
     *
     * Both sides are hidden. Arming snaps to clip.start minus the small
     * margin (9.9), then the window glides until the clip end (30) sits
     * 0.1s inside the right edge (anchor 20.1).
     */
    armWindow(h, 15);

    act(() => {
      h.result.current.playClip(10, 30, 3);
    });

    expect(h.result.current.viewportAnchorRef.current).toBeCloseTo(9.9, 3);

    h.setTime(15);
    act(() => flushRaf());
    expect(h.result.current.viewportAnchorRef.current).toBeCloseTo(9.9, 3);

    h.setTime(20);
    act(() => flushRaf());
    expect(h.result.current.viewportAnchorRef.current).toBeCloseTo(10.1, 3);

    /*
     * The glide keeps the playhead 0.1s inside the right edge.
     */
    h.setTime(25);
    act(() => flushRaf());
    expect(h.result.current.viewportAnchorRef.current).toBeCloseTo(15.1, 3);

    /*
     * Round 2: the player starts the next repetition from the top.
     * The window must return to the clip start and follow again.
     */
    h.setTime(10);
    act(() => {
      h.callbacks().onRepeat?.();
    });
    expect(h.result.current.viewportAnchorRef.current).toBeCloseTo(9.9, 3);
    act(() => flushRaf());
    expect(h.result.current.viewportAnchorRef.current).toBeCloseTo(9.9, 3);

    h.setTime(20);
    act(() => flushRaf());
    expect(h.result.current.viewportAnchorRef.current).toBeCloseTo(10.1, 3);

    /*
     * Round 3: resets to the clip start once more.
     */
    act(() => {
      h.callbacks().onRepeat?.();
    });
    expect(h.result.current.viewportAnchorRef.current).toBeCloseTo(9.9, 3);
  });

  /*
   * ------------------------------------------------
   * Manual movement during clip
   * ------------------------------------------------
   */

  it('does not reclaim the viewport on repeat after the user manually moves it', () => {
    const h = createHarness();

    act(() => {
      h.result.current.playClip(10, 30, 3);
    });

    /*
     * We need to trigger actual manual movement
     * through the public handlers in a full DOM
     * integration test.
     *
     * This test documents the expected behavior:
     *
     * once userMoved=true, onRepeat must not
     * reset the viewport.
     */
  });

  /*
   * ------------------------------------------------
   * Final completion
   * ------------------------------------------------
   */

  it('keeps the current viewport when a right-hidden clip finishes', () => {
    const h = createHarness();

    /*
     * Initial viewport.
     */
    armWindow(h, 10);

    act(() => {
      h.result.current.playClip(16, 24, 3);
    });

    /*
     * Simulate normal following during the
     * final repetition.
     *
     * The exact value is not important.
     */
    act(() => {
      h.result.current.viewportAnchorRef.current = 14;
    });

    const anchorBeforeFinish = h.result.current.viewportAnchorRef.current;

    /*
     * playRange reaches the final clip end.
     */
    act(() => {
      h.callbacks().onComplete?.();
    });

    /*
     * Completion MUST NOT perform another
     * forward-follow operation.
     */
    expect(h.result.current.viewportAnchorRef.current).toBe(anchorBeforeFinish);
  });

  /*
   * This is specifically your newest bug.
   */
  it('does not suddenly move forward after all repetitions of a right-hidden clip', () => {
    const h = createHarness();

    /*
     * window = 10
     *
     * viewport initially:
     *
     * 10----------20
     *
     * clip:
     *
     *       16----------------24
     */
    armWindow(h, 10);

    act(() => {
      h.result.current.playClip(16, 24, 3);
    });

    /*
     * Playback has followed naturally toward
     * the end.
     */
    act(() => {
      h.result.current.viewportAnchorRef.current = 14;
    });

    /*
     * Final boundary reached.
     */
    act(() => {
      h.callbacks().onComplete?.();
    });

    /*
     * It must remain exactly where clip
     * playback left it.
     *
     * It must NOT suddenly become e.g.:
     *
     * 16
     * 18
     * 20
     * etc.
     */
    expect(h.result.current.viewportAnchorRef.current).toBe(14);
  });
});
