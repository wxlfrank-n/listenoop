// @vitest-environment jsdom

import {act, renderHook} from '@testing-library/react';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {selectTrimRange} from '../store/selectors';
import type {RootState} from '../store/store';
import {useAudioPlayer} from './useAudioPlayer';
import {
  setCurrentTime,
  setIsPlaying,
  setCurrentTrackIndex,
  setDuration,
  setTracks,
} from '../store/playerSlice';

/*
 * ------------------------------------------------------------
 * Redux
 * ------------------------------------------------------------
 */

const dispatch = vi.fn();
let renderedPlayer: typeof playerState | undefined;
const trimAnalysis = vi.hoisted(() => ({
  waveformStatus: 'ready',
  waveform: {sourceUrl: '/trim.mp3', duration: 100},
  clips: [
    {start: 5, end: 8, vStart: 4.85, vEnd: 8.15},
    {start: 16, end: 20, vStart: 15.85, vEnd: 20.15},
  ],
}));

vi.mock('../store/hooks', () => ({
  useAppDispatch: () => dispatch,

  useAppSelector: (selector: (state: RootState) => unknown) =>
    selector === selectTrimRange || selector.name === 'isTrimAnalysisPending'
      ? selector({
          player: playerState,
          config: configState,
          analysis: trimAnalysis,
        } as RootState)
      : (renderedPlayer ?? {
          tracks: [],
          currentTrackIndex: -1,
          isPlaying: false,
          isClipPlaying: false,
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
  isClipPlaying: false,
  currentTime: 0,
  duration: 100,
}));

/* The playlist loop is off by default (`configSlice.DEFAULT_CONFIG`). */
const configState = vi.hoisted(() => ({
  trimEdgeSilence: false,
  loopMode: 'off',
  repetitions: 2,
  clipReplayMode: 'current',
  minClipLength: 0.3,
}));

vi.mock('../store/store', () => ({
  store: {
    getState: () => ({
      player: playerState,
      config: configState,
      analysis: trimAnalysis,
    }),
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
  playbackRate = 1;
  defaultPlaybackRate = 1;
  preservesPitch = false;
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

  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
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

    configState.trimEdgeSilence = false;
    configState.loopMode = 'off';
    configState.clipReplayMode = 'current';
    configState.minClipLength = 0.3;

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
    renderedPlayer = undefined;
    vi.useRealTimers();

    vi.unstubAllGlobals();
  });

  /*
   * ----------------------------------------------------------
   * Initial start
   * ----------------------------------------------------------
   */

  it('trims track playback at both ends and keeps an interior silent gap seekable', async () => {
    const originalTracks = playerState.tracks;
    const originalIndex = playerState.currentTrackIndex;
    try {
      playerState.tracks = [
        {id: 'trim', url: '/trim.mp3', title: '', artist: '', duration: 100},
      ];
      playerState.currentTrackIndex = 0;
      configState.trimEdgeSilence = true;
      trimAnalysis.waveformStatus = 'loading';
      renderedPlayer = playerState;
      const {result, rerender} = renderHook(() => useAudioPlayer(5));
      await act(async () => result.current.play());
      expect(audio.play).not.toHaveBeenCalled();
      trimAnalysis.waveformStatus = 'ready';
      await act(async () => rerender());
      expect(audio.play).toHaveBeenCalledTimes(1);
      expect(audio.currentTime).toBe(4.7);
      act(() => result.current.seek(12));
      expect(audio.currentTime).toBe(12);
      audio.currentTime = 20.4;
      act(() => {
        audio.dispatchEvent(new Event('timeupdate'));
      });
      expect(audio.paused).toBe(true);
      expect(audio.currentTime).toBe(20.3);
      act(() => result.current.skipBackward());
      expect(audio.currentTime).toBe(15.3);
      act(() => result.current.seek(6));
      act(() => result.current.skipBackward());
      expect(audio.currentTime).toBe(4.7);
      await act(async () => result.current.play());
      act(() => result.current.seek(19));
      act(() => result.current.skipForward());
      expect(audio.currentTime).toBe(20.3);
      expect(audio.paused).toBe(true);
      // Being close to a trimmed edge must still park at that edge.
      act(() => result.current.seek(20.28));
      act(() => result.current.next());
      expect(audio.currentTime).toBe(20.3);
      act(() => result.current.seek(4.72));
      act(() => result.current.prev());
      expect(audio.currentTime).toBe(4.7);
      act(() => result.current.prev());
      expect(audio.currentTime).toBe(4.7);
    } finally {
      trimAnalysis.waveformStatus = 'ready';
      renderedPlayer = undefined;
      playerState.tracks = originalTracks;
      playerState.currentTrackIndex = originalIndex;
    }
  });

  it('loads the saved track and seeks after its metadata is available', async () => {
    const {result, rerender} = renderHook(() => useAudioPlayer(5));
    const savedTracks = ['first', 'second'].map(id => ({
      id,
      title: id,
      artist: '',
      duration: 0,
      source: `/${id}.mp3`,
    }));

    act(() => {
      result.current.replacePlaylistTracks(savedTracks, {
        trackId: 'second',
        time: 12.5,
      });
    });
    expect(dispatch).toHaveBeenCalledWith(setCurrentTrackIndex(1));
    const tracks = savedTracks.map(({source, ...track}) => ({
      ...track,
      url: source,
    }));
    expect(dispatch).toHaveBeenCalledWith(setTracks(tracks));
    playerState.tracks = tracks;
    renderedPlayer = {...playerState, tracks, currentTrackIndex: 1};

    await act(async () => rerender());
    act(() => {
      audio.dispatchEvent(new Event('timeupdate'));
      audio.dispatchEvent(new Event('loadedmetadata'));
    });
    expect(audio.currentTime).toBe(12.5);
    expect(dispatch).toHaveBeenLastCalledWith(setDuration(100));
    expect(dispatch).not.toHaveBeenCalledWith(setCurrentTime(0));
    expect(audio.play).not.toHaveBeenCalled();
  });

  it('changes speed during a clip without changing pitch or restarting playback', () => {
    const {result, rerender} = renderHook(
      ({speed}) => useAudioPlayer(5, speed),
      {
        initialProps: {speed: 0.75},
      },
    );
    expect(audio.playbackRate).toBe(0.75);
    expect(audio.defaultPlaybackRate).toBe(0.75);
    expect(audio.preservesPitch).toBe(true);
    act(() => result.current.playRange(10, 20, 3));
    audio.currentTime = 12;
    const plays = audio.play.mock.calls.length;
    const loads = audio.load.mock.calls.length;
    rerender({speed: 0.5});
    expect(audio.playbackRate).toBe(0.5);
    expect(audio.preservesPitch).toBe(true);
    expect(audio.currentTime).toBe(12);
    expect(audio.play.mock.calls.length).toBe(plays);
    expect(audio.load.mock.calls.length).toBe(loads);
    rerender({speed: 1});
    expect(audio.playbackRate).toBe(1);
  });

  it('bounds speed and falls back safely for invalid values', () => {
    const {rerender} = renderHook(({speed}) => useAudioPlayer(5, speed), {
      initialProps: {speed: 0.1},
    });
    expect(audio.playbackRate).toBe(0.5);
    rerender({speed: 10});
    expect(audio.playbackRate).toBe(1.5);
    rerender({speed: NaN});
    expect(audio.playbackRate).toBe(1);
  });

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

  it('uses the playhead only for the first repetition of a resumed clip', async () => {
    const {result} = renderHook(() => useAudioPlayer(5));
    const onComplete = vi.fn();

    audio.currentTime = 15;
    act(() => {
      result.current.playRange(10, 20, 2, onComplete, undefined, false, 15);
    });
    await settleRestart();
    expect(audio.currentTime).toBe(15);

    audio.currentTime = 20;
    runRaf();
    expect(audio.currentTime).toBe(10);

    await settleRestart();
    audio.currentTime = 20;
    runRaf();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(audio.paused).toBe(true);
  });

  it.each([
    ['start', 0.3, 2, 0],
    ['current', 0.3, 0.4, 0.2],
    ['smart', 0.3, 0.8, 0],
    ['smart', 0.3, 1, 0.5],
    ['smart', 0.5, 1, 0],
    ['smart', 0.5, 1.2, 0.6],
  ] as const)(
    'applies %s replay mode (minimum %s, duration %s)',
    async (mode, minimum, duration, expected) => {
      configState.clipReplayMode = mode;
      configState.minClipLength = minimum;
      const {result} = renderHook(() => useAudioPlayer(5));
      audio.currentTime = duration / 2;
      act(() => {
        result.current.playRange(
          0,
          duration,
          2,
          undefined,
          undefined,
          false,
          duration / 2,
        );
      });
      await settleRestart();
      expect(audio.currentTime).toBeCloseTo(expected);
    },
  );

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

    it('restarts a one-track playlist when playback reaches its end', async () => {
      configState.loopMode = 'playlist';

      renderHook(() => useAudioPlayer(5));

      audio.currentTime = 100;

      await act(async () => {
        audio.dispatchEvent(new Event('ended'));
      });

      expect(audio.currentTime).toBe(0);
      expect(audio.play).toHaveBeenCalled();
    });

    it('repeats the current track without selecting or reloading it', async () => {
      configState.loopMode = 'track';
      playerState.tracks = [track, {...track, id: 't2', title: 'Other'}];
      renderHook(() => useAudioPlayer(5));
      audio.currentTime = 100;
      await act(async () => audio.dispatchEvent(new Event('ended')));
      expect(audio.currentTime).toBe(0);
      expect(audio.play).toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalledWith(setCurrentTrackIndex(0));
      expect(dispatch).not.toHaveBeenCalledWith(setCurrentTrackIndex(1));
    });

    it('wraps to the first track in visible sorted order', async () => {
      configState.loopMode = 'playlist';
      playerState.tracks = [
        {...track, title: 'Zebra'},
        {...track, id: 't2', title: 'Alpha', url: 'blob:alpha'},
      ];
      renderHook(() => useAudioPlayer(5));
      await act(async () => audio.dispatchEvent(new Event('ended')));
      expect(dispatch).toHaveBeenCalledWith(setCurrentTrackIndex(1));
      expect(dispatch).toHaveBeenCalledWith(setCurrentTime(0));
    });

    it('chooses a different track in random mode', async () => {
      configState.loopMode = 'shuffle';
      playerState.tracks = [track, {...track, id: 't2', url: 'blob:other'}];
      renderHook(() => useAudioPlayer(5));
      await act(async () => audio.dispatchEvent(new Event('ended')));
      expect(dispatch).toHaveBeenCalledWith(setCurrentTrackIndex(1));
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
  describe('clip tracklist mode', () => {
    const clips = [
      {start: 1, end: 2, vStart: 0.9, vEnd: 2.1},
      {start: 3, end: 4, vStart: 2.9, vEnd: 4.1},
    ];
    beforeEach(() => {
      configState.loopMode = 'clips';
      configState.repetitions = 2;
      playerState.tracks = [
        {id: 'a', title: 'A', artist: '', duration: 100, url: 'blob:a'},
        {id: 'b', title: 'B', artist: '', duration: 100, url: 'blob:b'},
      ];
      playerState.currentTrackIndex = 0;
    });

    it('repeats each clip twice then starts the next track', async () => {
      const {result} = renderHook(() => useAudioPlayer(5));
      const select = vi.fn();
      act(() => {
        result.current.setClipSequence(clips, select);
        result.current.play();
      });
      expect(audio.currentTime).toBe(0.9);
      await settleRestart();
      audio.currentTime = 2.1;
      runRaf();
      expect(audio.currentTime).toBe(0.9);
      await settleRestart();
      await act(async () => {
        audio.currentTime = 2.1;
        runRaf();
      });
      expect(select).toHaveBeenLastCalledWith(1);
      expect(audio.currentTime).toBe(2.9);
      await settleRestart();
      audio.currentTime = 4.1;
      runRaf();
      expect(audio.currentTime).toBe(2.9);
      await settleRestart();
      await act(async () => {
        audio.currentTime = 4.1;
        runRaf();
      });
      expect(dispatch).toHaveBeenCalledWith(setCurrentTrackIndex(1));
    });

    it('does not advance after pausing at the completion boundary', async () => {
      configState.repetitions = 1;
      const {result} = renderHook(() => useAudioPlayer(5));
      const select = vi.fn();
      act(() => {
        result.current.setClipSequence(clips, select);
        result.current.play();
      });
      await settleRestart();
      await act(async () => {
        audio.currentTime = 2.1;
        runRaf();
        result.current.pause();
      });
      expect(select).toHaveBeenCalledTimes(1);
      expect(audio.paused).toBe(true);
    });

    it('waits for clip registration and starts at the containing clip', async () => {
      const {result} = renderHook(() => useAudioPlayer(5));
      act(() => {
        result.current.play();
      });
      audio.currentTime = 3.2;
      const select = vi.fn();
      act(() => {
        result.current.setClipSequence(clips, select);
      });
      expect(select).toHaveBeenLastCalledWith(1);
      expect(audio.currentTime).toBe(2.9);
    });

    it('continues ordinary audio when no clips qualify', async () => {
      const {result} = renderHook(() => useAudioPlayer(5));
      act(() => {
        result.current.setClipSequence([], vi.fn());
        result.current.play();
      });
      await act(async () => {
        audio.dispatchEvent(new Event('ended'));
      });
      expect(dispatch).toHaveBeenCalledWith(setCurrentTrackIndex(1));
    });
  });
});
