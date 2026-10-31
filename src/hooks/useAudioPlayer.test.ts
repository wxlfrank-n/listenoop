// @vitest-environment jsdom

import {act, renderHook} from '@testing-library/react';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {useAudioPlayer} from './useAudioPlayer';
import {
  setCurrentTime,
  setIsPlaying,
  setCurrentTrackIndex,
  setDuration,
} from '../store/playerSlice';

/*
 * ------------------------------------------------------------
 * Redux
 * ------------------------------------------------------------
 */

const dispatch = vi.fn();

vi.mock('../store/hooks', () => ({
  useAppDispatch: () => dispatch,

  useAppSelector: () => ({
    tracks: [],
    currentTrackIndex: -1,
    isPlaying: false,
    currentTime: 0,
    duration: 100,
  }),
}));

const playerState = vi.hoisted(() => ({
  tracks: [] as Array<{
    id: string;
    title: string;
    artist: string;
    duration: number;
    url: string;
  }>,
  currentTrackIndex: -1,
  isPlaying: false,
  currentTime: 0,
  duration: 100,
}));

/* The playlist loop is off by default (`configSlice.DEFAULT_CONFIG`). */
const configState = vi.hoisted(() => ({
  loopPlaylist: false,
}));

vi.mock('../store/store', () => ({
  store: {
    getState: () => ({player: playerState, config: configState}),
  },
}));

/*
 * Don't create a real WebAudio graph.
 */
vi.mock('../utils/audio', () => {
  const analyser = {fftSize: 0, smoothingTimeConstant: 0, connect: vi.fn()};

  return {
    initializeAudioContext: vi.fn(() => ({
      state: 'running',
      destination: {},
      createAnalyser: vi.fn(() => analyser),
      createMediaElementSource: vi.fn(() => ({connect: vi.fn()})),
      resume: vi.fn(() => Promise.resolve()),
    })),

    decodeAudioBuffer: vi.fn(),
  };
});

vi.mock('../utils/wav', () => ({
  audioBufferToWavBlob: vi.fn(),
}));

/*
 * The audio player now talks to the worker client instead of the sync
 * utils. Mock the client so `getPlayableUrl` returns a deterministic
 * blob URL without spinning up a real Worker. The `clips` field is
 * required because the worker normally computes initial clips alongside
 * the WAV blob; the consumer (`useWaveform`) dispatches both to Redux.
 */
vi.mock('../workers/audioDecoderClient', () => ({
  evictAudio: vi.fn(),
  decodeAudio: vi.fn(() =>
    Promise.resolve({
      wavBlob: new Blob([new ArrayBuffer(8)], {type: 'audio/wav'}),
      mono: new Float32Array(8),
      sampleRate: 48000,
      duration: 0,
      numberOfChannels: 1,
      byteLength: 8,
      clips: {clips: [], gaps: [], initGap: 0},
    }),
  ),
  redetectClips: vi.fn(() =>
    Promise.resolve({clips: [], gaps: [], initGap: 0}),
  ),
}));

/*
 * ------------------------------------------------------------
 * Fake Audio
 * ------------------------------------------------------------
 */

class FakeAudio extends EventTarget {
  currentTime = 0;

  duration = 100;

  paused = true;

  src = '';

  error = null;

  dataset: Record<string, string> = {};

  play = vi.fn(() => {
    this.paused = false;

    /*
     * snatchToStart() listens for this.
     */
    this.dispatchEvent(new Event('playing'));

    this.dispatchEvent(new Event('play'));

    return Promise.resolve();
  });

  pause = vi.fn(() => {
    this.paused = true;

    this.dispatchEvent(new Event('pause'));
  });

  load = vi.fn();
}

let audio: FakeAudio;

/*
 * ------------------------------------------------------------
 * RAF controller
 * ------------------------------------------------------------
 *
 * playRange doesn't advance time itself.
 * The browser/audio element does that.
 *
 * Therefore each test explicitly:
 *
 *   audio.currentTime = ...
 *   runRaf()
 */

let rafCallback: FrameRequestCallback | null = null;

function runRaf() {
  const cb = rafCallback;

  if (!cb) {
    throw new Error('No requestAnimationFrame callback scheduled');
  }

  rafCallback = null;

  act(() => {
    cb(performance.now());
  });
}

/*
 * Initial resetToStart() schedules a 50ms
 * resume timer.
 */
async function settleRestart() {
  await act(async () => {
    vi.advanceTimersByTime(50);

    await Promise.resolve();
  });

  /*
   * First RAF observes currentTime ~= start
   * and changes seeking -> false.
   */
  runRaf();
}

describe('useAudioPlayer.playRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();

    dispatch.mockClear();

    configState.loopPlaylist = false;

    audio = new FakeAudio();

    function audioConstructor() {
      return audio;
    }

    /*
     * useAudioPlayer creates:
     *
     * useRef(new Audio())
     */
    vi.stubGlobal('Audio', audioConstructor);

    rafCallback = null;

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        rafCallback = callback;

        return 1;
      }),
    );

    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn(() => {
        rafCallback = null;
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();

    vi.unstubAllGlobals();
  });

  /*
   * ----------------------------------------------------------
   * Initial start
   * ----------------------------------------------------------
   */

  it('starts at the requested range start', async () => {
    const {result} = renderHook(() => useAudioPlayer(5));

    const onComplete = vi.fn();

    const onRepeat = vi.fn();

    act(() => {
      result.current.playRange(10, 20, 3, onComplete, onRepeat);
    });

    expect(audio.currentTime).toBe(10);

    /*
     * Initial start is NOT a repeat.
     */
    expect(onRepeat).not.toHaveBeenCalled();

    expect(onComplete).not.toHaveBeenCalled();

    await settleRestart();

    expect(audio.play).toHaveBeenCalled();
  });

  it('reports playback rejection and clears the error after successful playback', async () => {
    const {result} = renderHook(() => useAudioPlayer(5));
    audio.play.mockRejectedValueOnce(
      new DOMException('Unsupported', 'NotSupportedError'),
    );
    await act(async () => result.current.play());
    expect(result.current.playbackError).toBe(true);
    await act(async () => result.current.play());
    expect(result.current.playbackError).toBe(false);
  });

  it('ignores an interrupted play request', async () => {
    const {result} = renderHook(() => useAudioPlayer(5));
    audio.play.mockRejectedValueOnce(
      new DOMException('Interrupted', 'AbortError'),
    );
    await act(async () => result.current.play());
    expect(result.current.playbackError).toBe(false);
  });

  /*
   * ----------------------------------------------------------
   * One repetition
   * ----------------------------------------------------------
   */

  it('returns to start and calls onRepeat after reaching end', async () => {
    const {result} = renderHook(() => useAudioPlayer(5));

    const onComplete = vi.fn();

    const onRepeat = vi.fn();

    act(() => {
      result.current.playRange(10, 20, 3, onComplete, onRepeat);
    });

    /*
     * Finish initial seek.
     */
    await settleRestart();

    /*
     * Simulate normal playback.
     */
    audio.currentTime = 15;

    runRaf();

    expect(onRepeat).not.toHaveBeenCalled();

    /*
     * Reach range end.
     */
    audio.currentTime = 20;

    runRaf();

    /*
     * resetToStart(true)
     */
    expect(audio.currentTime).toBe(10);

    expect(onRepeat).toHaveBeenCalledTimes(1);

    expect(onComplete).not.toHaveBeenCalled();
  });

  /*
   * ----------------------------------------------------------
   * Multiple repetitions
   * ----------------------------------------------------------
   */

  it('plays the requested number of repetitions', async () => {
    const {result} = renderHook(() => useAudioPlayer(5));

    const onComplete = vi.fn();

    const onRepeat = vi.fn();

    act(() => {
      result.current.playRange(10, 20, 3, onComplete, onRepeat);
    });

    /*
     * ROUND 1
     */
    await settleRestart();

    audio.currentTime = 20;

    runRaf();

    expect(onRepeat).toHaveBeenCalledTimes(1);

    expect(audio.currentTime).toBe(10);

    /*
     * ROUND 2
     */
    await settleRestart();

    audio.currentTime = 20;

    runRaf();

    expect(onRepeat).toHaveBeenCalledTimes(2);

    expect(audio.currentTime).toBe(10);

    /*
     * ROUND 3
     */
    await settleRestart();

    audio.currentTime = 20;

    runRaf();

    /*
     * Final round must NOT start
     * another repetition.
     */
    expect(onRepeat).toHaveBeenCalledTimes(2);

    expect(onComplete).toHaveBeenCalledTimes(1);

    expect(audio.currentTime).toBe(20);

    expect(audio.paused).toBe(true);
  });

  /*
   * ----------------------------------------------------------
   * Overshoot
   * ----------------------------------------------------------
   *
   * This is important for the issue you observed:
   *
   * RAF may observe 20.02 instead of exactly 20.
   */

  it('normalizes an overshot final repetition to the exact end', async () => {
    const {result} = renderHook(() => useAudioPlayer(5));

    const onComplete = vi.fn();

    act(() => {
      result.current.playRange(10, 20, 1, onComplete);
    });

    await settleRestart();

    /*
     * Browser crossed the boundary
     * between two animation frames.
     */
    audio.currentTime = 20.037;

    runRaf();

    expect(audio.paused).toBe(true);

    /*
     * This is the important assertion.
     */
    expect(audio.currentTime).toBe(20);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  /*
   * ----------------------------------------------------------
   * Overshoot on a non-final repetition
   * ----------------------------------------------------------
   */

  it('restarts from exact start when an intermediate repetition overshoots end', async () => {
    const {result} = renderHook(() => useAudioPlayer(5));

    const onRepeat = vi.fn();

    act(() => {
      result.current.playRange(10, 20, 2, undefined, onRepeat);
    });

    await settleRestart();

    audio.currentTime = 20.041;

    runRaf();

    expect(audio.currentTime).toBe(10);

    expect(onRepeat).toHaveBeenCalledTimes(1);
  });

  /*
   * ----------------------------------------------------------
   * ended event
   * ----------------------------------------------------------
   */

  it('handles a clip ending at the end of the audio file', async () => {
    const {result} = renderHook(() => useAudioPlayer(5));

    const onComplete = vi.fn();

    const onRepeat = vi.fn();

    act(() => {
      result.current.playRange(90, 100, 2, onComplete, onRepeat);
    });

    await settleRestart();

    /*
     * Browser reaches actual media end.
     */
    audio.currentTime = 100;

    act(() => {
      audio.dispatchEvent(new Event('ended'));
    });

    expect(onRepeat).toHaveBeenCalledTimes(1);

    expect(audio.currentTime).toBe(90);

    /*
     * Second round.
     */
    await settleRestart();

    audio.currentTime = 100;

    act(() => {
      audio.dispatchEvent(new Event('ended'));
    });

    expect(onRepeat).toHaveBeenCalledTimes(1);

    expect(onComplete).toHaveBeenCalledTimes(1);

    expect(audio.currentTime).toBe(100);

    expect(audio.paused).toBe(true);
  });

  /*
   * ----------------------------------------------------------
   * skip to end
   * ----------------------------------------------------------
   *
   * First press: park at the end and stop (no auto-advance to the next track).
   * Second press (already at the end): advance.
   */
  describe('skip to end', () => {
    const track = {
      id: 't1',
      title: 'Track',
      artist: 'Artist',
      duration: 100,
      url: 'blob:track',
    };

    beforeEach(() => {
      playerState.tracks = [track];
      playerState.currentTrackIndex = 0;
    });

    it('jumps to the end and pauses without advancing', () => {
      const {result} = renderHook(() => useAudioPlayer(5));

      audio.currentTime = 40;

      act(() => {
        result.current.next();
      });

      expect(audio.currentTime).toBe(100);
      expect(audio.paused).toBe(true);
      expect(dispatch).toHaveBeenCalledWith(setCurrentTime(100));
      expect(dispatch).toHaveBeenCalledWith(setIsPlaying(false));
      expect(dispatch).not.toHaveBeenCalledWith(setCurrentTrackIndex(0));
    });

    it('does not advance if the element still fires `ended`', () => {
      const {result} = renderHook(() => useAudioPlayer(5));

      audio.currentTime = 40;

      act(() => {
        result.current.next();
      });

      // The browser can still emit `ended` for a seek to the very end.
      act(() => {
        audio.dispatchEvent(new Event('ended'));
      });

      expect(dispatch).not.toHaveBeenCalledWith(setCurrentTrackIndex(0));
    });

    it('goes to the start of the next track when already at the end', async () => {
      const {result} = renderHook(() => useAudioPlayer(5));

      audio.currentTime = 100;

      audio.play.mockClear();

      await act(async () => {
        result.current.next();
      });

      expect(dispatch).toHaveBeenCalledWith(setCurrentTrackIndex(0));
      expect(dispatch).toHaveBeenCalledWith(setCurrentTime(0));
      // Crossing the boundary only moves the playhead; it does not play.
      expect(audio.play).not.toHaveBeenCalled();
      expect(audio.paused).toBe(true);
    });

    it('advances on the second press after parking at the end', async () => {
      const {result} = renderHook(() => useAudioPlayer(5));

      audio.currentTime = 40;

      act(() => {
        result.current.next();
      });

      expect(audio.paused).toBe(true);

      audio.play.mockClear();

      await act(async () => {
        result.current.next();
      });

      expect(dispatch).toHaveBeenCalledWith(setCurrentTrackIndex(0));
      // The next track is loaded at its start, paused.
      expect(audio.play).not.toHaveBeenCalled();
      expect(audio.paused).toBe(true);
    });

    it('stops at the end when the playlist loop is off', () => {
      renderHook(() => useAudioPlayer(5));

      audio.currentTime = 100;

      act(() => {
        audio.dispatchEvent(new Event('ended'));
      });

      expect(dispatch).not.toHaveBeenCalledWith(setCurrentTrackIndex(0));
      expect(dispatch).toHaveBeenCalledWith(setIsPlaying(false));
      expect(dispatch).toHaveBeenCalledWith(setCurrentTime(100));
    });

    it('still advances when playback reaches the end on its own', () => {
      configState.loopPlaylist = true;

      renderHook(() => useAudioPlayer(5));

      audio.currentTime = 100;

      act(() => {
        audio.dispatchEvent(new Event('ended'));
      });

      expect(dispatch).toHaveBeenCalledWith(setCurrentTrackIndex(0));
    });
  });

  /*
   * ----------------------------------------------------------
   * skip to start
   * ----------------------------------------------------------
   *
   * First press: park at the start and stop. Second press (already at the
   * start): go to the previous track.
   */
  describe('skip to start', () => {
    const track = {
      id: 't1',
      title: 'Track',
      artist: 'Artist',
      duration: 100,
      url: 'blob:track',
    };

    beforeEach(() => {
      playerState.tracks = [track];
      playerState.currentTrackIndex = 0;
    });

    it('jumps to the start and pauses without changing track', () => {
      const {result} = renderHook(() => useAudioPlayer(5));

      audio.currentTime = 40;

      act(() => {
        result.current.prev();
      });

      expect(audio.currentTime).toBe(0);
      expect(audio.paused).toBe(true);
      expect(dispatch).toHaveBeenCalledWith(setCurrentTime(0));
      expect(dispatch).toHaveBeenCalledWith(setIsPlaying(false));
      expect(dispatch).not.toHaveBeenCalledWith(setCurrentTrackIndex(0));
    });

    it('goes to the end of the previous track when already at the start', async () => {
      playerState.tracks = [track, {...track, id: 't2', url: 'blob:track2'}];
      playerState.currentTrackIndex = 1;

      const {result} = renderHook(() => useAudioPlayer(5));

      audio.currentTime = 0;

      audio.play.mockClear();

      await act(async () => {
        result.current.prev();
      });

      expect(dispatch).toHaveBeenCalledWith(setCurrentTrackIndex(0));
      // Crossing the boundary only moves the playhead; it does not play.
      expect(audio.play).not.toHaveBeenCalled();
      expect(audio.paused).toBe(true);

      // The duration is known once the metadata arrives; park at the end.
      audio.duration = 100;
      act(() => {
        audio.dispatchEvent(new Event('loadedmetadata'));
      });

      expect(audio.currentTime).toBe(100);
      expect(dispatch).toHaveBeenCalledWith(setCurrentTime(100));
      expect(dispatch).toHaveBeenCalledWith(setDuration(100));
    });

    it('goes to the previous track on the second press after parking at the start', async () => {
      playerState.tracks = [track, {...track, id: 't2', url: 'blob:track2'}];
      playerState.currentTrackIndex = 1;

      const {result} = renderHook(() => useAudioPlayer(5));

      audio.currentTime = 40;

      act(() => {
        result.current.prev();
      });

      expect(audio.currentTime).toBe(0);
      expect(audio.paused).toBe(true);

      audio.play.mockClear();

      await act(async () => {
        result.current.prev();
      });

      expect(dispatch).toHaveBeenCalledWith(setCurrentTrackIndex(0));
      // The previous track is loaded parked at its end, paused.
      expect(audio.play).not.toHaveBeenCalled();
      expect(audio.paused).toBe(true);
    });
  });
});
