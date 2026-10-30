import {useRef, useCallback, useEffect} from 'react';
import type {Track} from '../types';
import {useState} from 'react';
import {decodeAudio, evictAudio} from '../workers/audioDecoderClient';
import {initializeAudioContext} from '../utils/audio';
import {addListener, addListeners} from '../utils/listener';
import {store} from '../store/store';
import {useAppDispatch, useAppSelector} from '../store/hooks';
import {
  setTracks,
  setCurrentTrackIndex,
  setIsPlaying,
  setCurrentTime,
  setDuration,
} from '../store/playerSlice';
import {selectDetectionOptions} from '../store/selectors';

// iOS devices (including Chrome on iPhone, which uses the WebKit engine)
// cannot route an <audio> element through the Web Audio graph reliably:
// `createMediaElementSource` is broken on iOS/WebKit — the element's timeline
// and the audible output diverge, so seeking is unreliable and clip loops play
// stale content / skip rounds. On those devices playback must go straight to
// the speakers (the dancing-lines canvas simply has no live data).
const isIOS =
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// How close to a media edge counts as being at that edge. Used by the skip-to-end
// and skip-to-start buttons to tell "jump to the edge and stop" apart from
// "already there, go to the adjacent track".
const EDGE_TOLERANCE_SEC = 0.05;

// When playback starts after a seek, the browser may begin slightly past the
// requested position (preroll/seek settling), skipping the very beginning.
// Snap the playhead back to `time` once rendering actually starts.
function snatchToStart(audio: HTMLAudioElement, time: number) {
  const stop = addListener(audio, 'playing', () => {
    if (Math.abs(audio.currentTime - time) > 0.08) {
      audio.currentTime = time;
    }
    stop();
  });
}

export function useAudioPlayer(skipSeconds: number) {
  const [playbackError, setPlaybackError] = useState(false);
  const reportPlaybackError = useCallback((error: unknown) => {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    setPlaybackError(true);
  }, []);
  const dispatch = useAppDispatch();
  // Live playback state, kept in Redux so every component shares it.
  const state = useAppSelector(s => s.player);

  // Fresh read of player state for imperative callbacks (event handlers, rAF).
  const getPlayer = () => store.getState().player;

  // Detection options for the worker's `decode` request. Read via a ref so
  // changes don't trigger re-decode — only the URL matters; the cache is
  // keyed by URL, so a fresh decode only happens on track switch.
  const detectionOptionsRef = useRef({
    blockMs: 12,
    silenceRatio: 0.01,
    minClipLength: 0.3,
    minSplitPieceSec: 0.1,
  });
  // Keep the ref in sync with the latest config from the player slice's
  // owner (App.tsx). Memoized via `selectDetectionOptions` so a config
  // object reference is reused across renders — the previous inline
  // `useAppSelector(s => ({...}))` returned a new object every call and
  // tripped Redux's selector-stability warning on every store tick.
  const detectionOptions = useAppSelector(selectDetectionOptions);
  useEffect(() => {
    detectionOptionsRef.current = detectionOptions;
  });

  const audioRef = useRef<HTMLAudioElement>(new Audio());
  const nextRef = useRef<() => void>(() => {});
  const expectedRawUrlRef = useRef<string | null>(null);
  const trackLoadIdRef = useRef(0);
  const wavBlobCacheRef = useRef<Map<string, string>>(new Map());
  // Handle of the pending `setTimeout(() => startTrack(...), 0)` scheduled
  // by `addTracks`, so it can be cancelled on unmount instead of firing
  // against a stale audio element.
  const startTrackTimerRef = useRef<number | undefined>(undefined);
  // Every `blob:` URL we hand out (file picks + WAV re-encodes) is tracked here
  // so it can be revoked when the corresponding track is removed. Without
  // revocation each blob lives for the lifetime of the page and the leaked
  // memory grows with the number of files the user has ever loaded.
  const blobUrlsRef = useRef<Set<string>>(new Set());

  // Track a blob URL for later cleanup. Non-blob URLs (e.g. the bundled
  // sample track served from /public) are ignored — revoking them would be
  // a no-op anyway.
  const trackBlobUrl = useCallback((url: string) => {
    if (url.startsWith('blob:')) blobUrlsRef.current.add(url);
  }, []);

  // Revoke a blob URL (if it is one) and drop it from the tracking set.
  const revokeBlobUrl = useCallback((url: string) => {
    if (!url.startsWith('blob:')) return;
    URL.revokeObjectURL(url);
    blobUrlsRef.current.delete(url);
  }, []);
  // True while a clip range is paused only to seek back to its start for the
  // next repetition. During that window the element's native `pause` event and
  // the range restart must not publish isPlaying=false, or the waveform views
  // would see playback "stop" at every loop.
  const suppressRangePauseRef = useRef(false);
  // Set when the skip-to-end button parks the playhead at the media end. While
  // true the element's `ended` handler must not auto-advance to the next track;
  // the same button pressed again advances instead.
  const holdAtEndRef = useRef(false);
  // Lazily-created Web Audio graph wired through the audio element; feeding the
  // final music through the analyser lets the UI draw live dancing lines.
  const analyserRef = useRef<{
    ctx: AudioContext;
    analyser: AnalyserNode;
  } | null>(null);

  /**
   * Gets or creates the Web Audio analyser node for waveform visualization.
   * Creates the shared AudioContext on first call (user gesture required).
   *
   * The analyser node provides real-time frequency data used to draw the
   * waveform visualization component (Waveform.tsx, RowWaveform.tsx).
   *
   * Architecture:
   * - HTMLAudioElement → MediaElementAudioSourceNode → AnalyserNode → Destination
   * - This lets us visualize without interfering with playback
   *
   * @param resume - Whether to resume the context if suspended (default: true)
   * @returns AnalyserNode for waveform data, or null if creation failed
   */
  const getAnalyser = useCallback(
    (resume: boolean = true): AnalyserNode | null => {
      if (isIOS) return null;
      if (!resume && !analyserRef.current) return null;
      // Return existing analyser if already created
      if (analyserRef.current) {
        // Resume context if needed (e.g., after pause)
        if (resume && analyserRef.current.ctx.state === 'suspended') {
          analyserRef.current.ctx.resume().catch(() => {});
        }
        return analyserRef.current.analyser;
      }
      try {
        // Initialize shared AudioContext on user gesture (must be from play click)
        const ctx = initializeAudioContext();

        // Create analyser for frequency data (used by waveform visualization)
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024; // Balance between resolution and performance
        analyser.smoothingTimeConstant = 0.72; // Smooth transitions in frequency data

        // Wire up audio graph: audio element → analyser → speakers
        const src = ctx.createMediaElementSource(audioRef.current); // src = the audio element's single entry point into the Web Audio graph
        src.connect(analyser);
        analyser.connect(ctx.destination);

        // Cache for later use
        analyserRef.current = {ctx, analyser};

        // Resume context if suspended (required by autoplay policy)
        if (resume && ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }

        return analyser;
      } catch (err) {
        console.debug('Failed to create analyser:', err);
        return null; // Graceful fallback if Web Audio not supported
      }
    },
    [],
  );

  const getCurrentTime = useCallback(() => audioRef.current.currentTime, []);

  /**
   * Gets or creates a playable audio URL by decoding and re-encoding as WAV.
   * Uses a cache to avoid redundant decoding operations.
   *
   * The WAV re-encoding ensures consistent format across browsers and allows
   * proper waveform extraction by other components.
   *
   * @param url - The URL of the original audio file
   * @returns A blob URL pointing to the WAV-encoded audio data
   */
  const getPlayableUrl = useCallback(
    async (url: string): Promise<string> => {
      const cache = wavBlobCacheRef.current;
      const cached = cache.get(url);
      if (cached) return cached;

      const {wavBlob} = await decodeAudio(url, detectionOptionsRef.current);
      if (!getPlayer().tracks.some(track => track.url === url)) {
        throw new DOMException('Track removed', 'AbortError');
      }
      const objectUrl = URL.createObjectURL(wavBlob);
      cache.set(url, objectUrl);
      trackBlobUrl(objectUrl);
      return objectUrl;
    },
    [trackBlobUrl],
  );

  // Point the audio element at a new source.
  /**
   * Loads a new audio track into the element.
   * Handles both WAV-encoded playback and raw audio URL fallback.
   *
   * Flow:
   * 1. Initialize AudioContext for Web Audio features (waveform visualization)
   * 2. Decode audio file to WAV format for consistent playback
   * 3. Fall back to raw URL if decoding fails
   * 4. Load the audio element, then play it or park it at a boundary
   *
   * @param audio - The HTMLAudioElement to use for playback
   * @param url - The URL of the audio file to load
   * @param options.play - Start playing after loading (default: true)
   * @param options.atEnd - Park the playhead at the end instead (paused).
   *   Waits for metadata, since the duration is only known once it loads.
   */
  const startTrack = useCallback(
    async (
      audio: HTMLAudioElement,
      url: string,
      {play = true, atEnd = false}: {play?: boolean; atEnd?: boolean} = {},
    ) => {
      // Initialize AudioContext on user gesture (from next/prev buttons or click)
      getAnalyser();
      const loadId = ++trackLoadIdRef.current;
      setPlaybackError(false);
      audio.pause();
      holdAtEndRef.current = false;
      dispatch(setIsPlaying(false));
      expectedRawUrlRef.current = url;

      const load = (src: string) => {
        // Only update if this is still the expected URL
        if (
          trackLoadIdRef.current !== loadId ||
          expectedRawUrlRef.current !== url
        ) {
          return;
        }

        audio.src = src;
        audio.load();

        if (atEnd) {
          const parkAtEnd = () => {
            if (trackLoadIdRef.current !== loadId) return;
            // A seek to the very end can emit `ended`; hold it so the parked
            // position is not mistaken for a finished track.
            holdAtEndRef.current = true;
            const duration = audio.duration;
            audio.currentTime = duration;
            dispatch(setDuration(duration));
            dispatch(setCurrentTime(duration));
            dispatch(setIsPlaying(false));
          };

          if (audio.readyState >= 1) parkAtEnd();
          else
            audio.addEventListener('loadedmetadata', parkAtEnd, {once: true});
          return;
        }

        if (!play) return;

        audio
          .play()
          .then(() => dispatch(setIsPlaying(true)))
          .catch(err => {
            console.debug('Start track play failed:', err);
            if (trackLoadIdRef.current === loadId) reportPlaybackError(err);
          });
      };

      try {
        load(await getPlayableUrl(url));
      } catch (error) {
        console.error('Failed to decode audio for playback:', error);
        // Fallback to raw URL if decoding fails
        load(url);
      }
    },
    [dispatch, getAnalyser, getPlayableUrl, reportPlaybackError],
  );

  useEffect(() => {
    nextRef.current = () => {
      const s = getPlayer();
      if (s.tracks.length === 0) return;
      const nextIndex = (s.currentTrackIndex + 1) % s.tracks.length;
      const track = s.tracks[nextIndex];
      if (!track) return;
      startTrack(audioRef.current, track.url).catch(err => {
        console.error('Failed to start next track:', err);
      });
      dispatch(setCurrentTrackIndex(nextIndex));
      dispatch(setCurrentTime(0));
      dispatch(setDuration(0));
    };
  });

  /**
   * Loads the track `offset` places away (wrapping) without starting playback,
   * parked at its end when `atEnd` is set. The skip buttons use this when they
   * cross a track boundary: they only move the playhead, they do not play.
   */
  const loadAdjacentTrack = useCallback(
    (offset: -1 | 1, atEnd = false) => {
      const s = getPlayer();
      if (s.tracks.length === 0) return;
      const index =
        (s.currentTrackIndex + offset + s.tracks.length) % s.tracks.length;
      const track = s.tracks[index];
      if (!track) return;
      startTrack(audioRef.current, track.url, {play: false, atEnd}).catch(
        err => {
          console.error('Failed to load adjacent track:', err);
        },
      );
      dispatch(setCurrentTrackIndex(index));
      dispatch(setCurrentTime(0));
      dispatch(setDuration(0));
    },
    [dispatch, startTrack],
  );

  useEffect(() => {
    const audio = audioRef.current;

    const onTimeUpdate = () => {
      dispatch(setCurrentTime(audio.currentTime));
    };
    const onLoadedMetadata = () => dispatch(setDuration(audio.duration));
    const onPlay = () => {
      setPlaybackError(false);
      dispatch(setIsPlaying(true));
    };
    const onPause = () => {
      // A transient pause fired purely to seek a clip range back to its start.
      // The loop is still "playing" — publishing isPlaying=false here would
      // flip the waveform views' follow state off at every repetition.
      if (suppressRangePauseRef.current) return;
      dispatch(setIsPlaying(false));
    };
    const onEnded = () => {
      // While a clip/sector is looping, the range owns the element's `ended`
      // event — a clip ending exactly at the file end must not jump to the
      // next track mid-loop.
      if (audioRef.current.dataset.clipLoopActive === '1') return;
      // Skip-to-end parked the playhead here; hold instead of advancing. The
      // next press of the button advances (see `next`).
      if (holdAtEndRef.current) {
        holdAtEndRef.current = false;
        return;
      }
      // Without the playlist loop the track just stops at its end. The next
      // press of play restarts it (the media element rewinds a finished
      // track on `play()`).
      if (!store.getState().config.loopPlaylist) {
        dispatch(setCurrentTime(audioRef.current.currentTime));
        dispatch(setIsPlaying(false));
        return;
      }
      nextRef.current();
    };
    const onError = () => {
      setPlaybackError(true);
      dispatch(setIsPlaying(false));
      console.error('Audio error', audio.error);
    };

    return addListeners(audio, [
      ['timeupdate', onTimeUpdate],
      ['loadedmetadata', onLoadedMetadata],
      ['play', onPlay],
      ['pause', onPause],
      ['ended', onEnded],
      ['error', onError],
    ]);
  }, [dispatch]);

  useEffect(() => {
    const audio = audioRef.current;
    const track = state.tracks[state.currentTrackIndex];
    if (track && !audio.src) {
      expectedRawUrlRef.current = track.url;
      getPlayableUrl(track.url)
        .then(playableUrl => {
          if (expectedRawUrlRef.current === track.url && !audio.src) {
            audio.src = playableUrl;
            audio.load();
          }
        })
        .catch(error => {
          console.error('Failed to decode initial audio:', error);
          if (expectedRawUrlRef.current === track.url && !audio.src) {
            audio.src = track.url;
            audio.load();
          }
        });
    }
  }, [state.tracks, state.currentTrackIndex, getPlayableUrl]);

  const play = useCallback(() => {
    // Initialize shared AudioContext on first user gesture (play click)
    // This complies with browser autoplay policy and enables Web Audio features
    getAnalyser();
    holdAtEndRef.current = false;
    audioRef.current
      .play()
      .then(() => dispatch(setIsPlaying(true)))
      .catch(err => {
        console.debug('Play failed (may retry):', err);
        reportPlaybackError(err);
      });
  }, [dispatch, getAnalyser, reportPlaybackError]);

  // Reference to the range's active rAF loop / ended listener so that starting a
  // new range (e.g. clicking another clip) drops the previous one instead of
  // letting the old range keep looping/pausing.
  const rangeRafRef = useRef(0);
  const rangeEndedStopRef = useRef<(() => void) | null>(null);
  // Monotonic id so a late callback (stale resume timer / event) from a
  // previous range can never touch the state of the range that replaced it.
  const rangeRunIdRef = useRef(0);

  const stopRangeMonitoring = useCallback(() => {
    if (rangeRafRef.current) {
      cancelAnimationFrame(rangeRafRef.current);
      rangeRafRef.current = 0;
    }
    const audio = audioRef.current;
    rangeEndedStopRef.current?.();
    rangeEndedStopRef.current = null;
    audio.dataset.clipLoopActive = '0';
    suppressRangePauseRef.current = false;
  }, []);

  const pause = useCallback(() => {
    stopRangeMonitoring();
    const audio = audioRef.current;
    audio.pause();
    dispatch(setCurrentTime(audio.currentTime));
    dispatch(setIsPlaying(false));
  }, [dispatch, stopRangeMonitoring]);

  useEffect(() => {
    if (playbackError) {
      stopRangeMonitoring();
      audioRef.current.pause();
      dispatch(setIsPlaying(false));
    }
  }, [playbackError, stopRangeMonitoring, dispatch]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (getPlayer().isPlaying) {
      // Pause playback
      stopRangeMonitoring();
      audio.pause();
      dispatch(setCurrentTime(audio.currentTime));
      dispatch(setIsPlaying(false));
      return;
    }
    // Resume playback and initialize AudioContext (user gesture)
    getAnalyser();
    holdAtEndRef.current = false;
    audio
      .play()
      .then(() => dispatch(setIsPlaying(true)))
      .catch(err => {
        console.debug('Toggle play failed (may retry):', err);
        reportPlaybackError(err);
      });
  }, [dispatch, getAnalyser, stopRangeMonitoring, reportPlaybackError]);

  /*
   * The "skip to end" button works in two steps:
   *  - Not at the end yet: jump to the end and stop there, holding playback so
   *    the `ended` event does not roll on to the next track.
   *  - Already at the end: go to the start of the next track, paused.
   */
  const next = useCallback(() => {
    const audio = audioRef.current;
    const duration = audio.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;

    const atEnd =
      audio.ended || audio.currentTime >= duration - EDGE_TOLERANCE_SEC;

    if (atEnd) {
      holdAtEndRef.current = false;
      loadAdjacentTrack(1);
      return;
    }

    // Park at the end, paused. Pausing before the seek keeps the element from
    // firing `ended`; the ref guards the case where it fires anyway.
    stopRangeMonitoring();
    holdAtEndRef.current = true;
    audio.pause();
    audio.currentTime = duration;
    dispatch(setCurrentTime(duration));
    dispatch(setIsPlaying(false));
  }, [dispatch, loadAdjacentTrack, stopRangeMonitoring]);

  /*
   * The "skip to start" button mirrors skip-to-end:
   *  - Not at the start yet: jump to the start and stop there.
   *  - Already at the start: go to the end of the previous track, paused.
   */
  const prev = useCallback(() => {
    const audio = audioRef.current;
    holdAtEndRef.current = false;

    if (audio.currentTime <= EDGE_TOLERANCE_SEC) {
      loadAdjacentTrack(-1, true);
      return;
    }

    stopRangeMonitoring();
    audio.pause();
    audio.currentTime = 0;
    dispatch(setCurrentTime(0));
    dispatch(setIsPlaying(false));
  }, [dispatch, loadAdjacentTrack, stopRangeMonitoring]);

  const seek = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      holdAtEndRef.current = false;
      if (audio.paused) snatchToStart(audio, time);
      audio.currentTime = time;
      console.debug('Seek to:', time);
      dispatch(setCurrentTime(time));
    },
    [dispatch],
  );

  const addTracks = useCallback(
    (files: FileList, playAfter: boolean = false) => {
      const all = Array.from(files);
      const supported = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.webm'];
      const audioFiles = all.filter(f =>
        supported.some(ext => f.name.toLowerCase().endsWith(ext)),
      );
      const skipped = all.length - audioFiles.length;
      const newTracks: Track[] = audioFiles.map(file => {
        const url = URL.createObjectURL(file);
        trackBlobUrl(url);
        return {
          id: crypto.randomUUID(),
          title: file.name.replace(/\.[^/.]+$/, ''),
          artist: 'Unknown Artist',
          duration: 0,
          url,
        };
      });
      if (newTracks.length === 0) return {added: 0, skipped};

      const s = getPlayer();
      const startIndex = s.tracks.length;
      dispatch(setTracks([...s.tracks, ...newTracks]));

      if (playAfter || s.currentTrackIndex === -1) {
        const track = newTracks[0];
        if (track) {
          // Tracked so the pending `startTrack` can be cancelled on unmount
          // (see the cleanup effect below); otherwise it fires against a
          // stale audio element after the hook is gone.
          if (startTrackTimerRef.current !== undefined) {
            window.clearTimeout(startTrackTimerRef.current);
          }
          startTrackTimerRef.current = window.setTimeout(
            () => startTrack(audioRef.current, track.url),
            0,
          );
          dispatch(setCurrentTrackIndex(startIndex));
          dispatch(setCurrentTime(0));
          dispatch(setDuration(0));
        }
      }

      return {added: newTracks.length, skipped};
    },
    [dispatch, startTrack],
  );

  const removeTrack = useCallback(
    (index: number) => {
      const s = getPlayer();
      const removedTrack = s.tracks[index];
      const newTracks = s.tracks.filter((_, i) => i !== index);
      let newIndex = s.currentTrackIndex;
      const audio = audioRef.current;

      if (index === s.currentTrackIndex) {
        if (newTracks.length === 0) {
          trackLoadIdRef.current += 1;
          expectedRawUrlRef.current = null;
          newIndex = -1;
          audio.pause();
          audio.src = '';
        } else {
          newIndex = Math.min(index, newTracks.length - 1);
          const track = newTracks[newIndex];
          if (track) {
            startTrack(audio, track.url).catch(err => {
              console.error('Failed to start track after removal:', err);
            });
          }
        }
      } else if (index < s.currentTrackIndex) {
        newIndex = s.currentTrackIndex - 1;
      }

      dispatch(setTracks(newTracks));
      dispatch(setCurrentTrackIndex(newIndex));

      // Release the blob URLs held by the removed track: both the original
      // file pick URL (if user-added) and the cached WAV re-encode URL.
      if (removedTrack) {
        evictAudio(removedTrack.url);
        const wavUrl = wavBlobCacheRef.current.get(removedTrack.url);
        if (wavUrl) {
          revokeBlobUrl(wavUrl);
          wavBlobCacheRef.current.delete(removedTrack.url);
        }
        revokeBlobUrl(removedTrack.url);
      }
    },
    [dispatch, startTrack, revokeBlobUrl],
  );

  const selectTrack = useCallback(
    (index: number) => {
      const s = getPlayer();
      const track = s.tracks[index];
      if (!track) return;
      startTrack(audioRef.current, track.url).catch(err => {
        console.error('Failed to start track:', err);
      });
      dispatch(setCurrentTrackIndex(index));
      dispatch(setCurrentTime(0));
      dispatch(setDuration(0));
    },
    [dispatch, startTrack],
  );

  const skipForward = useCallback(() => {
    const audio = audioRef.current;
    holdAtEndRef.current = false;
    const newTime = Math.min(
      audio.currentTime + skipSeconds,
      audio.duration || 0,
    );
    audio.currentTime = newTime;
    dispatch(setCurrentTime(newTime));
  }, [dispatch, skipSeconds]);

  const skipBackward = useCallback(() => {
    const audio = audioRef.current;
    holdAtEndRef.current = false;
    const newTime = Math.max(audio.currentTime - skipSeconds, 0);
    audio.currentTime = newTime;
    dispatch(setCurrentTime(newTime));
  }, [dispatch, skipSeconds]);

  // Plays the given time range [start, end] `repetitions` times sequentially,
  // pausing at `end` after the last repetition. Calls onComplete when finished.
  // Boundary detection runs on requestAnimationFrame (not the ~250ms
  // `timeupdate` cadence), so a clip stops within a frame of its end and
  // loops restart exactly at `start` instead of drifting.
  //
  // iOS/WebKit robustness: assigning `audio.currentTime` on a *playing*
  // element is applied asynchronously and can be delayed or ignored entirely,
  // leaving the audible output playing the previous region. Every loop restart
  // therefore pauses first, seeks, and only resumes once the seek has settled;
  // while it settles, a `seeking` guard ignores stale playhead reads so a
  // boundary is never counted twice (which used to skip/finish rounds early).
  const playRange = useCallback(
    (
      start: number,
      end: number,
      repetitions: number,
      onComplete?: () => void,
      onRepeat?: () => void,
    ) => {
      const audio = audioRef.current;

      getAnalyser();

      /*
       * Drop previous range playback completely.
       */
      stopRangeMonitoring();

      audio.dataset.clipLoopActive = '1';

      const runId = ++rangeRunIdRef.current;

      let count = 0;

      /*
       * Ignore stale currentTime until the requested
       * seek has actually reached start.
       */
      let seeking = true;

      let seekRequestTs = performance.now();

      let recoveryAttempts = 0;

      let resumeTimer = 0;

      const cancelResume = () => {
        if (!resumeTimer) {
          return;
        }

        window.clearTimeout(resumeTimer);

        resumeTimer = 0;
      };

      const stopLoop = () => {
        if (!rangeRafRef.current) {
          return;
        }

        cancelAnimationFrame(rangeRafRef.current);

        rangeRafRef.current = 0;
      };

      const cleanupRange = () => {
        cancelResume();

        stopLoop();

        rangeEndedStopRef.current?.();
        rangeEndedStopRef.current = null;

        audio.dataset.clipLoopActive = '0';
      };

      const abortLoop = () => {
        cleanupRange();

        audio.pause();

        dispatch(setIsPlaying(false));

        dispatch(setCurrentTime(audio.currentTime));

        onComplete?.();
      };

      /**
       * Final clip completion.
       *
       * The media may have overshot the boundary by
       * a few milliseconds because requestAnimationFrame
       * is not sample-accurate.
       *
       * Pause first, then normalize to the exact range end.
       */
      const finishLoop = () => {
        if (runId !== rangeRunIdRef.current) {
          return;
        }

        /*
         * Stop playback immediately.
         */
        audio.pause();

        /*
         * Stop the monitoring before changing currentTime
         * so the seek cannot be interpreted as another
         * range boundary.
         */
        cleanupRange();

        /*
         * Normalize the actual media element as well.
         *
         * This is important: after clip playback finishes,
         * getCurrentTime() must also return `end`, not an
         * overshot value.
         */
        if (Math.abs(audio.currentTime - end) > 0.001) {
          audio.currentTime = end;
        }

        /*
         * Freeze React's logical time at exactly end.
         */
        dispatch(setCurrentTime(end));

        /*
         * The waveform completion callback runs before
         * the normal paused-state lifecycle can interpret
         * currentTime=end as an ordinary seek.
         */
        onComplete?.();

        dispatch(setIsPlaying(false));
      };

      /**
       * Move playback back to clip.start.
       *
       * repeat=false:
       *   initial start
       *
       * repeat=true:
       *   repetition restart
       */
      const resetToStart = (repeat: boolean) => {
        if (runId !== rangeRunIdRef.current) {
          return;
        }

        seeking = true;

        seekRequestTs = performance.now();

        cancelResume();

        /*
         * This pause is part of looping.
         *
         * It is NOT a user pause.
         */
        suppressRangePauseRef.current = true;

        audio.pause();

        audio.currentTime = start;

        dispatch(setCurrentTime(start));

        /*
         * Authoritative repetition event.
         *
         * The waveform resets the viewport here.
         */
        if (repeat) {
          onRepeat?.();
        }

        /*
         * Give the seek a short time to settle.
         */
        resumeTimer = window.setTimeout(() => {
          suppressRangePauseRef.current = false;

          if (runId !== rangeRunIdRef.current) {
            return;
          }

          resumeTimer = 0;

          snatchToStart(audio, start);

          audio
            .play()
            .then(() => {
              if (runId !== rangeRunIdRef.current) {
                return;
              }

              dispatch(setIsPlaying(true));
            })
            .catch(error => {
              if (runId === rangeRunIdRef.current) reportPlaybackError(error);
            });
        }, 50);
      };

      const tick = () => {
        if (!rangeRafRef.current) {
          return;
        }

        if (runId !== rangeRunIdRef.current) {
          return;
        }

        const t = audio.currentTime;

        if (seeking) {
          const nearStart = t >= start - 0.05 && t <= start + 0.15;

          if (nearStart) {
            seeking = false;

            /*
             * A successful seek resets recovery state.
             */
            recoveryAttempts = 0;
          } else if (performance.now() - seekRequestTs > 3000) {
            /*
             * iOS occasionally ignores the first seek.
             */
            if (recoveryAttempts < 1) {
              recoveryAttempts++;

              suppressRangePauseRef.current = true;

              audio.pause();

              audio.currentTime = start;

              seekRequestTs = performance.now();

              suppressRangePauseRef.current = false;

              audio
                .play()
                .then(() => {
                  if (runId !== rangeRunIdRef.current) {
                    return;
                  }

                  dispatch(setIsPlaying(true));
                })
                .catch(error => {
                  if (runId === rangeRunIdRef.current)
                    reportPlaybackError(error);
                });
            } else {
              abortLoop();

              return;
            }
          }
        } else {
          /*
           * Clip boundary.
           */
          if (t >= end) {
            count++;

            /*
             * Last repetition.
             */
            if (count >= repetitions) {
              finishLoop();

              return;
            }

            /*
             * Another repetition remains.
             */
            resetToStart(true);
          } else if (t < start - 0.05) {
            /*
             * Unexpected backwards movement.
             */
            abortLoop();

            return;
          }
        }

        rangeRafRef.current = requestAnimationFrame(tick);
      };

      /**
       * Handle clips whose end equals the actual
       * media-file end.
       */
      const onEnded = () => {
        if (!rangeRafRef.current) {
          return;
        }

        if (runId !== rangeRunIdRef.current) {
          return;
        }

        /*
         * If we're still settling a seek, this isn't
         * a valid range boundary.
         */
        if (seeking) {
          return;
        }

        count++;

        if (count >= repetitions) {
          finishLoop();

          return;
        }

        resetToStart(true);
      };

      rangeEndedStopRef.current = addListener(audio, 'ended', onEnded);

      /*
       * Initial playback.
       *
       * This is not a repetition.
       */
      resetToStart(false);

      rangeRafRef.current = requestAnimationFrame(tick);
    },
    [dispatch, getAnalyser, stopRangeMonitoring, reportPlaybackError],
  );

  /*
   * System media integration (parity with the native MediaSession): the OS /
   * lock screen shows the current track and its controls drive the same
   * handlers as the UI buttons. Everything is guarded — environments without
   * the Media Session API ignore it, and teardown clears the handlers.
   */
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    const s = getPlayer();
    const track = s.tracks[s.currentTrackIndex];
    try {
      session.metadata = track
        ? new MediaMetadata({
            title: track.title,
            artist: track.artist,
            album: '',
          })
        : null;
    } catch {
      // Metadata is best-effort (e.g. privacy-restricted contexts).
    }
    session.playbackState = s.isPlaying ? 'playing' : 'paused';
    session.setActionHandler('play', () => play());
    session.setActionHandler('pause', () => pause());
    session.setActionHandler('previoustrack', () => prev());
    session.setActionHandler('nexttrack', () => next());
    session.setActionHandler('seekto', details => {
      if (typeof details.seekTime === 'number') seek(details.seekTime);
    });
    // Skip actions use the configured interval (any fixed OS default is
    // ignored), matching the native skip commands.
    session.setActionHandler('seekbackward', () => skipBackward());
    session.setActionHandler('seekforward', () => skipForward());
    return () => {
      for (const action of [
        'play',
        'pause',
        'previoustrack',
        'nexttrack',
        'seekto',
        'seekbackward',
        'seekforward',
      ] as const) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Ignore teardown errors.
        }
      }
    };
  }, [
    pause,
    play,
    prev,
    next,
    seek,
    skipBackward,
    skipForward,
    state.tracks,
    state.currentTrackIndex,
    state.isPlaying,
  ]);

  // Cancel the pending `startTrack` timer on unmount so it doesn't fire
  // against a stale audio element (relevant for HMR / test teardown).
  useEffect(() => {
    return () => {
      if (startTrackTimerRef.current !== undefined) {
        window.clearTimeout(startTrackTimerRef.current);
        startTrackTimerRef.current = undefined;
      }
    };
  }, []);

  return {
    state,
    playbackError,
    retryPlayback: () => {
      const s = getPlayer();
      const track = s.tracks[s.currentTrackIndex];
      if (track) void startTrack(audioRef.current, track.url);
    },
    nextTrack: () => nextRef.current(),
    play,
    pause,
    togglePlay,
    next,
    prev,
    seek,
    addTracks,
    removeTrack,
    selectTrack,
    skipForward,
    skipBackward,
    playRange,
    getAnalyser,
    getCurrentTime,
  };
}
