import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {
  Dispatch,
  PointerEvent as ReactPointerEvent,
  RefObject,
  SetStateAction,
} from 'react';
import {
  CURSOR_CLICK_HOLD_MS,
  HS_PAN_DECIDE_PX,
  PAD,
  VB_H,
  WAVE_BUFFER_MARGIN_WINDOWS,
  WAVE_BUFFER_WINDOWS,
  clampWindowAnchor,
  getClipPlaybackViewport,
  getWindowSecs,
  makeFollowEpoch,
  resolveViewportAnchor,
} from '../utils/rowWaveform';
import type {PlaybackContext, ViewportContext} from '../utils/rowWaveform';
import {positionClipLabels} from '../utils/clipLabels';
import {updateCursorStyle} from '../utils/cursorStyle';
import {
  playedFraction,
  updatePlayedStyle,
  updateTrackStyle,
} from '../utils/waveform';
import {DIAGONAL_MIN_TAN} from '../components/Clip';
import {panTarget} from '../utils/pan';
import {clipPinchState} from '../components/clipPinch';
import {clipGestureLedger} from '../components/clipPinch';
import {startFrameLoop} from '../utils/raf';
import {addListener, addListeners} from '../utils/listener';

export {
  BARS_TAIL_SEC,
  PAD,
  VB_H,
  VB_W,
  WAVE_BUFFER_MARGIN_WINDOWS,
  WAVE_BUFFER_WINDOWS,
} from '../utils/rowWaveform';

export interface UseRowWaveformScrollArgs {
  waveformDuration: number;
  minClipLength: number;
  currentTime: number;
  onSeek: (time: number) => void;
  onPlayRange: (
    start: number,
    end: number,
    repetitions: number,
    onComplete?: () => void,
    onRepeat?: () => void,
  ) => void;
  repetitions: number;
  onStopPlayback?: () => void;
  onActiveClipChange: (idx: number) => void;
  onSwipeClip?: (idx: number, direction: 'up' | 'down') => void;
  getCurrentTime: () => number;
  playing: boolean;
  scrolling: boolean;
  setScrolling: Dispatch<SetStateAction<boolean>>;
  scrollTimeoutRef: RefObject<number | undefined>;
  cursorElRef?: RefObject<HTMLDivElement | null>;
  playedElRef?: RefObject<HTMLDivElement | null>;
  clipLabelLayerRef?: RefObject<HTMLDivElement | null>;
  /**
   * Time position (seconds) the viewport should anchor to on mount. Used
   * when the view is first rendered or re-mounted after a view switch so
   * the user sees the relevant part of the waveform instead of position 0.
   * Typically the active clip's midpoint, or the current playhead time when
   * no clip is selected. Only consulted on the first render — subsequent
   * anchor changes go through the normal follow/seek flow.
   */
  initialAnchorSec?: number;
}

export function useRowWaveformScroll({
  waveformDuration,
  minClipLength,
  currentTime,
  onSeek,
  onPlayRange,
  onActiveClipChange,
  getCurrentTime,
  playing,
  scrolling,
  setScrolling,
  scrollTimeoutRef,
  cursorElRef,
  playedElRef,
  clipLabelLayerRef,
  initialAnchorSec = 0,
}: UseRowWaveformScrollArgs) {
  const innerH = VB_H - PAD * 2;
  const hsRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const hsWinLenRef = useRef(0);
  const hsMaxStartRef = useRef(0);
  const [windowSecs, setWindowSecs] = useState(0);
  // Initialize to `initialAnchorSec` so a freshly-mounted view (including
  // a view switch) opens at the active clip / playhead instead of at 0.
  // `useRef` only reads the initial value, which is exactly what we want:
  // the anchor is set once on mount and then driven by the normal
  // follow / seek flow.
  const viewportAnchorRef = useRef(initialAnchorSec);
  const bufferAnchorRef = useRef(0);
  const pendingBufferAnchorRef = useRef<number | null>(null);
  const bufferLengthRef = useRef(0);

  const [renderedBufferAnchor, setRenderedBufferAnchor] = useState(0);
  const playingRef = useRef(playing);
  const draggingRef = useRef(false);
  const scrollingRef = useRef(scrolling);
  const previousTimeRef = useRef(currentTime);
  const suppressClickRef = useRef(false);
  const playbackContextRef = useRef<PlaybackContext>({
    type: playing ? 'normal' : 'idle',
  });
  const viewportContextRef = useRef<ViewportContext>({
    type: 'follow',
    epoch: makeFollowEpoch(initialAnchorSec, 0, getCurrentTime()),
  });
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    scrollingRef.current = scrolling;
  }, [scrolling]);
  const setViewportFollow = useCallback(
    (time = getCurrentTime()) => {
      viewportContextRef.current = {
        type: 'follow',
        epoch: makeFollowEpoch(
          viewportAnchorRef.current,
          hsWinLenRef.current,
          time,
        ),
      };
    },
    [getCurrentTime],
  );
  const isTimeInViewport = useCallback((time: number) => {
    const start = viewportAnchorRef.current;
    const end = start + hsWinLenRef.current;
    return time >= start && time <= end;
  }, []);
  const calculateBufferStart = useCallback(
    (viewportStart: number) => {
      const win = hsWinLenRef.current;
      const bufferLength = Math.min(
        waveformDuration,
        win * WAVE_BUFFER_WINDOWS,
      );
      bufferLengthRef.current = bufferLength;
      const desired = viewportStart - win;
      const maxBufferStart = Math.max(0, waveformDuration - bufferLength);
      return Math.max(0, Math.min(desired, maxBufferStart));
    },
    [waveformDuration],
  );
  const ensureWaveBuffer = useCallback(
    (viewportStart: number, force = false) => {
      const win = hsWinLenRef.current;
      const viewportEnd = viewportStart + win;
      const effectiveBufferStart =
        pendingBufferAnchorRef.current ?? bufferAnchorRef.current;
      const bufferEnd = effectiveBufferStart + bufferLengthRef.current;
      const margin = win * WAVE_BUFFER_MARGIN_WINDOWS;
      const nearLeftEdge =
        effectiveBufferStart > 0 &&
        viewportStart < effectiveBufferStart + margin;
      const nearRightEdge =
        bufferEnd < waveformDuration && viewportEnd > bufferEnd - margin;
      if (!force && !nearLeftEdge && !nearRightEdge) {
        return;
      }
      const nextBufferStart = calculateBufferStart(viewportStart);
      if (Math.abs(nextBufferStart - effectiveBufferStart) < 1e-6) {
        return;
      }
      pendingBufferAnchorRef.current = nextBufferStart;
      setRenderedBufferAnchor(current =>
        Math.abs(current - nextBufferStart) < 1e-6 ? current : nextBufferStart,
      );
    },
    [calculateBufferStart, waveformDuration],
  );
  const setLiveAnchor = useCallback(
    (target: number, forceRedraw = false) => {
      const next = clampWindowAnchor(target, hsMaxStartRef.current);
      viewportAnchorRef.current = next;
      ensureWaveBuffer(next, forceRedraw);
    },
    [ensureWaveBuffer],
  );
  const applyWidth = useCallback(
    (width: number) => {
      if (width <= 0 || waveformDuration <= 0) return;
      const nextWindowSecs = Math.min(
        getWindowSecs(width, minClipLength),
        waveformDuration,
      );
      if (!Number.isFinite(nextWindowSecs) || nextWindowSecs <= 0) return;
      if (Math.abs(nextWindowSecs - hsWinLenRef.current) < 1e-6) return;
      hsWinLenRef.current = nextWindowSecs;
      hsMaxStartRef.current = Math.max(0, waveformDuration - nextWindowSecs);
      bufferLengthRef.current = Math.min(
        waveformDuration,
        nextWindowSecs * WAVE_BUFFER_WINDOWS,
      );
      const nextAnchor = clampWindowAnchor(
        viewportAnchorRef.current,
        hsMaxStartRef.current,
      );
      viewportAnchorRef.current = nextAnchor;
      // This state update is intentional: refs alone do not cause the initial
      // clips/waveform to rerender after the real element width is measured.
      setWindowSecs(nextWindowSecs);
      setLiveAnchor(nextAnchor, true);
      if (viewportContextRef.current.type === 'follow') {
        setViewportFollow(getCurrentTime());
      }
    },
    [
      getCurrentTime,
      minClipLength,
      setLiveAnchor,
      setViewportFollow,
      waveformDuration,
    ],
  );
  useLayoutEffect(() => {
    const element = hsRef.current;
    if (!element) return;
    applyWidth(element.clientWidth);
  }, [applyWidth]);
  useEffect(() => {
    const element = hsRef.current;
    if (!element) return;
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(entries => {
        const entry = entries[0];
        if (entry) applyWidth(entry.contentRect.width);
      });
      observer.observe(element);
      return () => observer.disconnect();
    }
    const onResize = () => applyWidth(element.clientWidth);
    return addListener(window, 'resize', onResize);
  }, [applyWidth]);
  // Center the labels right after the layer mounts. Until the first RAF tick
  // they would otherwise sit at their CSS layout position, which is not where
  // the visible part of the clip is.
  useLayoutEffect(() => {
    const win = hsWinLenRef.current || 1;
    const viewportWidthPx = hsRef.current?.parentElement?.clientWidth || 1;
    positionClipLabels(
      clipLabelLayerRef?.current,
      viewportAnchorRef.current,
      win,
      viewportWidthPx / win,
    );
  }, [clipLabelLayerRef]);
  const renderFrame = useCallback(
    (time: number, anchor: number) => {
      const track = trackRef.current;
      if (!track) return;
      const viewport = track.parentElement;
      if (!viewport) return;
      const win = hsWinLenRef.current || 1;
      const viewportWidthPx = viewport.clientWidth || 1;
      const pxPerSec = viewportWidthPx / win;
      const bufferStart = bufferAnchorRef.current;
      const bufferLen = bufferLengthRef.current || win;
      updateTrackStyle(track, anchor, win, pxPerSec, bufferStart, bufferLen);
      // Keep each clip label centered in the visible part of its clip.
      // This is updated in the same RAF as the viewport because the viewport
      // moves imperatively without causing a React render on every frame.
      positionClipLabels(clipLabelLayerRef?.current, anchor, win, pxPerSec);
      updatePlayedStyle(playedElRef?.current, time, bufferStart, bufferLen);
      updateCursorStyle(
        cursorElRef?.current,
        time,
        anchor,
        win,
        pxPerSec,
        bufferStart,
        waveformDuration,
      );
    },
    [clipLabelLayerRef, cursorElRef, playedElRef, waveformDuration],
  );
  useLayoutEffect(() => {
    bufferAnchorRef.current = renderedBufferAnchor;
    pendingBufferAnchorRef.current = null;
    renderFrame(getCurrentTime(), viewportAnchorRef.current);
  }, [getCurrentTime, renderFrame, renderedBufferAnchor]);
  useEffect(
    () =>
      startFrameLoop(() => {
        const time = getCurrentTime();
        let anchor = viewportAnchorRef.current;
        if (playingRef.current && !draggingRef.current) {
          anchor = resolveViewportAnchor(
            viewportContextRef.current,
            anchor,
            time,
            hsWinLenRef.current,
            hsMaxStartRef.current,
            performance.now(),
          );
          setLiveAnchor(anchor);
        }
        renderFrame(time, viewportAnchorRef.current);
      }),
    [getCurrentTime, renderFrame, setLiveAnchor],
  );
  const previousPlayingRef = useRef(playing);
  useEffect(() => {
    const wasPlaying = previousPlayingRef.current;
    previousPlayingRef.current = playing;
    if (!wasPlaying && playing) {
      if (playbackContextRef.current.type !== 'clip') {
        playbackContextRef.current = {type: 'normal'};
        setViewportFollow();
      }
      return;
    }
    if (wasPlaying && !playing) {
      if (playbackContextRef.current.type === 'clip') {
        setViewportFollow();
      }
      playbackContextRef.current = {type: 'idle'};
    }
  }, [playing, setViewportFollow]);
  useEffect(() => {
    const previous = previousTimeRef.current;
    previousTimeRef.current = currentTime;
    if (playingRef.current || draggingRef.current) {
      return;
    }
    if (Math.abs(currentTime - previous) < 1e-6) {
      return;
    }
    const windowLength = hsWinLenRef.current;
    /*
     * An explicit jump that lands outside the viewport — skip-to-start/end, or
     * any seek away from a panned or clip-followed view — must bring the
     * playhead back on screen. `resolveFollow` deliberately never moves the
     * viewport backwards, so build a fresh follow epoch here (its `align` is set
     * because the target is outside) rather than reusing the current context.
     */
    const jumpedOutside = !isTimeInViewport(currentTime);
    if (
      !jumpedOutside &&
      (viewportContextRef.current.type === 'clip-follow' ||
        viewportContextRef.current.type === 'manual')
    ) {
      renderFrame(currentTime, viewportAnchorRef.current);
      return;
    }
    const context: ViewportContext = jumpedOutside
      ? {
          type: 'follow',
          epoch: makeFollowEpoch(
            viewportAnchorRef.current,
            windowLength,
            currentTime,
          ),
        }
      : viewportContextRef.current;
    const next = resolveViewportAnchor(
      context,
      viewportAnchorRef.current,
      currentTime,
      windowLength,
      hsMaxStartRef.current,
      performance.now(),
    );
    setLiveAnchor(next);
    setViewportFollow(currentTime);
    renderFrame(currentTime, next);
  }, [
    currentTime,
    isTimeInViewport,
    renderFrame,
    setLiveAnchor,
    setViewportFollow,
  ]);
  const completeClipPlayback = useCallback(
    (end: number) => {
      playbackContextRef.current = {type: 'idle'};

      const windowLength = hsWinLenRef.current;

      // If clip-follow reached the clip's right boundary, keep that exact
      // viewport after playback finishes. Do NOT let normal follow advance it.
      const clipEndAnchor = clampWindowAnchor(
        Math.max(0, end - windowLength),
        hsMaxStartRef.current,
      );

      const context = viewportContextRef.current;

      if (
        context.type === 'clip-follow' &&
        context.autoFollow &&
        viewportAnchorRef.current >= clipEndAnchor - 1e-6
      ) {
        setLiveAnchor(clipEndAnchor);
      }

      // Playback has stopped. Keep the resulting viewport stationary.
      viewportContextRef.current = {type: 'manual'};

      scrollingRef.current = false;
      setScrolling(false);

      renderFrame(end, viewportAnchorRef.current);
    },
    [renderFrame, setLiveAnchor, setScrolling],
  );
  const startClipRound = useCallback(
    (start: number, end: number, preserveManual = false) => {
      const viewport = viewportContextRef.current;
      // Manual takeover is preserved only between repetitions of the same
      // playRange operation. A new explicit clip click always re-arms the
      // clip from the current geometry.
      if (preserveManual && viewport.type === 'manual') return;
      const windowLength = hsWinLenRef.current;
      const result = getClipPlaybackViewport(
        start,
        end,
        viewportAnchorRef.current,
        windowLength,
        hsMaxStartRef.current,
      );
      const target = result.anchor;
      viewportContextRef.current = {
        type: 'clip-follow',
        start,
        end,
        autoFollow: result.autoFollow,
        epoch: makeFollowEpoch(target, windowLength, start),
      };
      setLiveAnchor(target, true);
      renderFrame(start, target);
    },
    [renderFrame, setLiveAnchor],
  );
  const playClip = useCallback(
    (start: number, end: number, reps: number) => {
      playbackContextRef.current = {type: 'clip', start, end};
      startClipRound(start, end);
      onPlayRange(
        start,
        end,
        reps,
        () => completeClipPlayback(end),
        () => startClipRound(start, end, true),
      );
    },
    [completeClipPlayback, onPlayRange, startClipRound],
  );
  const markManualScroll = useCallback(() => {
    scrollingRef.current = true;
    setScrolling(true);
    window.clearTimeout(scrollTimeoutRef.current);
    viewportContextRef.current = {type: 'manual'};
    if (playbackContextRef.current.type === 'clip') return;
    scrollTimeoutRef.current = window.setTimeout(() => {
      scrollingRef.current = false;
      setScrolling(false);
      const time = getCurrentTime();
      if (playingRef.current && !isTimeInViewport(time)) return;
      setViewportFollow(time);
    }, 1500);
  }, [
    getCurrentTime,
    isTimeInViewport,
    scrollTimeoutRef,
    setScrolling,
    setViewportFollow,
  ]);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startAnchor: number;
    panned: boolean;
  } | null>(null);
  const onHsPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') {
        return;
      }
      const downTarget = e.target as Element;
      if (!hsRef.current?.contains(downTarget)) {
        return;
      }
      if (!trackRef.current?.contains(downTarget)) {
        return;
      }
      if (downTarget.closest('.clip-label, .stacked-clip-label')) {
        return;
      }
      /*
       * Two fingers are already on clips (a pinch merge in progress): do not
       * start a pan.
       */
      if (clipPinchState.active) {
        return;
      }
      if (dragRef.current?.pointerId === e.pointerId) {
        return;
      }
      suppressClickRef.current = false;
      const element = e.currentTarget;
      const drag = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startAnchor: viewportAnchorRef.current,
        panned: false,
      };
      dragRef.current = drag;
      draggingRef.current = true;
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== drag.pointerId) {
          return;
        }
        /*
         * A second finger landed on a clip (pinch merge in progress): stand
         * down so the squeeze is not mistaken for a pan.
         */
        if (clipPinchState.active) {
          return;
        }

        /*
         * The clip latched a swipe direction: the gesture belongs to the clip,
         * so the waveform must not pan away from its live preview.
         */
        if (clipGestureLedger.clipSwipeLocked) {
          return;
        }

        const dx = ev.clientX - drag.startX;
        const dy = ev.clientY - drag.startY;
        if (!drag.panned) {
          if (
            Math.abs(dx) < HS_PAN_DECIDE_PX &&
            Math.abs(dy) < HS_PAN_DECIDE_PX
          ) {
            return;
          }
          /*
           * Clip gesture: vertical swipe, or a diagonal 15-75 degree swipe.
           * Stand down so Clip can interpret it. Panning only engages for
           * gestures staying within 15 degrees of the horizontal.
           */
          if (Math.abs(dy) >= DIAGONAL_MIN_TAN * Math.abs(dx)) {
            return;
          }
        }
        ev.preventDefault();
        drag.panned = true;
        setLiveAnchor(
          panTarget(
            drag.startAnchor,
            dx,
            hsWinLenRef.current,
            element.clientWidth,
            hsMaxStartRef.current,
          ),
        );
        markManualScroll();
      };
      const onEnd = (ev: PointerEvent) => {
        if (ev.pointerId !== drag.pointerId) {
          return;
        }
        ev.preventDefault();
        stopDragListeners();
        dragRef.current = null;
        draggingRef.current = false;
        if (drag.panned) {
          suppressClickRef.current = true;
        }
      };
      // The drag listeners remove themselves once the pointer is released, so
      // the cleanup handle is assigned after `onEnd` closes over it.
      let stopDragListeners: () => void = () => {};
      stopDragListeners = addListeners(window, [
        ['pointermove', onMove, true],
        ['pointerup', onEnd, true],
        ['pointercancel', onEnd, true],
      ]);
    },
    [markManualScroll, setLiveAnchor],
  );
  const onWaveformClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      if (
        playbackContextRef.current.type === 'clip' ||
        e.currentTarget.parentElement === null
      )
        return;
      const rect = e.currentTarget.parentElement.getBoundingClientRect();
      const fraction = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      const target = viewportAnchorRef.current + fraction * hsWinLenRef.current;
      onSeek(target);
      onActiveClipChange(-1);
      viewportContextRef.current = {
        type: 'cursor-hold',
        epoch: makeFollowEpoch(
          viewportAnchorRef.current,
          hsWinLenRef.current,
          target,
        ),
        holdUntil: performance.now() + CURSOR_CLICK_HOLD_MS,
      };
    },
    [onActiveClipChange, onSeek],
  );
  const onRootClickCapture = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!suppressClickRef.current) {
        return;
      }
      suppressClickRef.current = false;
      e.stopPropagation();
    },
    [],
  );
  const getStripPlayedPct = useCallback(() => {
    return playedFraction(
      getCurrentTime(),
      bufferAnchorRef.current,
      bufferLengthRef.current,
    );
  }, [getCurrentTime]);
  return {
    hsRef,
    trackRef,
    renderedBufferAnchor,
    hsAnchor: windowSecs,
    hsWinLenRef,
    hsMaxStartRef,
    bufferLengthRef,
    bufferAnchorRef,
    viewportAnchorRef,
    playbackContextRef,
    viewportContextRef,
    hsSmoothRef: viewportAnchorRef,
    innerH,
    onHsPointerDown,
    onRootClickCapture,
    onWaveformClick,
    getStripPlayedPct,
    playClip,
  };
}
