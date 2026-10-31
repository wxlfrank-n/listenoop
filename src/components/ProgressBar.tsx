/**
 * Main progress and waveform visualization component.
 *
 * Shows the decoded waveform (stacked or horizontal view), the silence-split
 * clips, and the interactive clip toolbar.
 *
 * The waveform view switch is rendered directly under progress-container.
 * Its visual styling and page-flip behavior are owned by
 * WaveformViewFlipButton.
 */

import {useMemo, useCallback, useRef, useState, useEffect} from 'react';

import {shallowEqual} from 'react-redux';

import {RowWaveform} from './RowWaveform';
import {StackedWaveform} from './StackedWaveform';
import {ClipToolbar} from './ClipToolbar';
import {ClipToolbarCollapsedHit} from './ClipToolbarCollapsedHit';
import {WaveformViewFlipButton} from './WaveformViewFlipButton';

import {useAppDispatch, useAppSelector} from '../store/hooks';
import {useT} from '../i18n';

import {
  selectCurrentAudio,
  selectWaveformView,
  selectIsPlaying,
  selectRepetitions,
  selectShowAdvancedControls,
  selectMergeScope,
  selectMinClipLength,
} from '../store/selectors';

import {updateConfig} from '../store/configSlice';

import {mergeClipsByGap} from '../utils/clips';
import type {Clip as InitClipData} from '../utils/clips';
import type {ClipPlayRequest, SwipeDirection} from '../types';
import './ProgressBar.css';

import {
  splitClip,
  splitClipEnd,
  mergeClips,
  mergeClipRange,
  type ClipSplitResult,
} from '../utils/swipe';

interface ProgressBarProps {
  /** Seek to an absolute track time (seconds). */
  onSeek: (time: number) => void;

  /**
   * Play a range, repeating `repetitions` times,
   * with an optional completion callback.
   */
  onPlayRange: (
    start: number,
    end: number,
    repetitions: number,
    onComplete?: () => void,
  ) => void;

  onStopPlayback: () => void;

  getAnalyser?: () => AnalyserNode | null;

  /** Returns the current playback time in seconds. */
  getCurrentTime: () => number;
}

export function ProgressBar({
  onSeek,
  onPlayRange,
  onStopPlayback,
  getAnalyser,
  getCurrentTime,
}: ProgressBarProps) {
  const dispatch = useAppDispatch();
  const t = useT();

  const audio = useAppSelector(selectCurrentAudio, shallowEqual);

  const waveformView = useAppSelector(selectWaveformView);

  const playing = useAppSelector(selectIsPlaying);

  const repetitions = useAppSelector(selectRepetitions);

  const showAdvancedControls = useAppSelector(selectShowAdvancedControls);

  const mergeScope = useAppSelector(selectMergeScope);

  const minClipLength = useAppSelector(selectMinClipLength);

  const {waveform, waveformStatus, clips, currentTime, initGap} = audio;

  const hasWaveform = waveform !== null && waveform.data.length > 0;

  /*
   * Merge gap is derived from the detected silence gaps
   * for the current waveform.
   */
  const [mergeGap, setMergeGap] = useState(initGap);

  useEffect(() => {
    setMergeGap(initGap);
  }, [initGap]);

  /*
   * The grouping the detector itself asked for, before any user merge/split.
   * This is the starting point for "clip" scope.
   */
  const baselineClips = useMemo(
    () => mergeClipsByGap(clips, initGap),
    [clips, initGap],
  );

  /*
   * "clip" scope cannot be derived from a single threshold, so the regrouped
   * list is held here instead and only ever changed by a gesture or by the
   * slider acting on the selected clip. `null` means "not regrouped yet", i.e.
   * show the baseline.
   *
   * Reset per track change (see below) so it can never leak across tracks.
   */
  const [scopedClips, setScopedClips] = useState<InitClipData[] | null>(null);

  const displayClips = useMemo(() => {
    if (mergeScope === 'clip') return scopedClips ?? baselineClips;
    return mergeClipsByGap(clips, mergeGap);
  }, [mergeScope, scopedClips, baselineClips, clips, mergeGap]);

  /*
   * Scroll state shared with RowWaveform's follow behavior.
   */
  const [scrolling, setScrolling] = useState(false);

  const scrollTimeoutRef = useRef<number | undefined>(undefined);

  /*
   * ---------------------------------------------------------
   * ACTIVE CLIP
   * ---------------------------------------------------------
   *
   * Index into `displayClips` (the currently grouped list), so it is only
   * meaningful together with the grouping that produced it.
   *
   * This is local UI state: nothing outside this component reads it, and it
   * must not outlive the grouping, so it does not belong in the store.
   */
  const [activeClip, setActiveClip] = useState(-1);

  /*
   * One-shot request for the mounted view to start playing a clip, published
   * after a split/merge regroups the clips. The view owns the playback context,
   * so it reacts to this itself.
   */
  const [clipPlayRequest, setClipPlayRequest] = useState<
    ClipPlayRequest | undefined
  >(undefined);

  const playRequestNonceRef = useRef(0);

  /*
   * Loading a different track replaces `clips` wholesale, so the stored index
   * no longer refers to the same clip. Reset it.
   *
   * Deliberately NOT keyed on `mergeGap`: a split/merge sets both the new gap
   * and the new active clip in the same handler, so clearing on gap change
   * would immediately undo the selection the gesture just made.
   */
  useEffect(() => {
    setActiveClip(-1);
  }, [clips]);

  /*
   * Per-clip grouping belongs to the track it was built from, so drop it when
   * the track's clips are replaced.
   */
  useEffect(() => {
    setScopedClips(null);
  }, [clips]);

  /*
   * ---------------------------------------------------------
   * CONFIG
   * ---------------------------------------------------------
   */

  const handleRepetitionsChange = useCallback(
    (value: number) => {
      dispatch(
        updateConfig({
          repetitions: value,
        }),
      );
    },
    [dispatch],
  );

  const handleWaveformViewChange = useCallback(
    (view: 'horizontal' | 'stacked') => {
      dispatch(
        updateConfig({
          waveformView: view,
        }),
      );
    },
    [dispatch],
  );

  /*
   * ---------------------------------------------------------
   * CLIP SELECTION
   * ---------------------------------------------------------
   */

  /*
   * `idx` comes from the clip list the user is looking at, so it is validated
   * against `displayClips`, not the raw `clips` (whose indexes differ whenever
   * clips are grouped).
   */
  const handleActiveClipChange = useCallback(
    (idx: number) => {
      if (!displayClips[idx]) {
        return;
      }

      setActiveClip(idx);
    },
    [displayClips],
  );

  /*
   * Publish a one-shot playback request for `clip`.
   *
   * The nonce makes each request distinct, so requesting the same clip twice in
   * a row still re-arms playback instead of being treated as a duplicate.
   */
  const requestClipPlayback = useCallback(
    (clip: InitClipData) => {
      playRequestNonceRef.current += 1;

      setClipPlayRequest({
        clip,
        repetitions,
        nonce: playRequestNonceRef.current,
      });
    },
    [repetitions],
  );

  /*
   * ---------------------------------------------------------
   * CLIP SPLIT / MERGE
   * ---------------------------------------------------------
   */

  /*
   * Publish the outcome of a split gesture.
   *
   * `displayClips` still describes the pre-split grouping here, so the new clip
   * has to be re-derived from the raw clips at the new merge gap. Indexing the
   * stale list would replay the pre-split clip's range.
   */
  const publishSplit = useCallback(
    (result: ClipSplitResult | null) => {
      if (!result) {
        return;
      }

      setMergeGap(result.mergeGap);

      if (mergeScope === 'clip') {
        setScopedClips(result.clips ?? null);
      }

      setActiveClip(result.activeClip);

      const newActiveClip = result.clips?.[result.activeClip];

      if (newActiveClip) {
        requestClipPlayback(newActiveClip);
      }
    },
    [mergeScope, requestClipPlayback],
  );

  const handleClipSwipe = useCallback(
    (idx: number, direction: SwipeDirection) => {
      /*
       * Swipe down:
       * merge this clip with an adjacent clip.
       */
      if (direction === 'down') {
        const result = mergeClips(clips, displayClips, idx, mergeScope);

        if (!result) {
          return;
        }

        setMergeGap(result.mergeGap);

        /*
         * "clip" scope keeps its own grouping, so the gesture's result becomes
         * the new list. In "global" scope `displayClips` is derived from
         * `mergeGap`, which was just updated above.
         */
        if (mergeScope === 'clip') {
          setScopedClips(result.clips);
        }

        setActiveClip(result.activeClip);

        const newActiveClip = result.clips?.[result.activeClip];

        if (newActiveClip) {
          requestClipPlayback(newActiveClip);
        }

        return;
      }

      /*
       * Swipe up:
       * split/unpack a virtually merged clip.
       */
      publishSplit(
        splitClip(clips, displayClips, idx, mergeScope, minClipLength),
      );
    },
    [
      clips,
      displayClips,
      mergeScope,
      minClipLength,
      publishSplit,
      requestClipPlayback,
    ],
  );

  /*
   * Fuse every displayClip from `low` to `high` (inclusive) into one group and
   * publish the post-merge playback request. Shared by the pinch merge and the
   * diagonal swipes.
   */
  const applyRangeMerge = useCallback(
    (low: number, high: number) => {
      const result = mergeClipRange(clips, displayClips, low, high, mergeScope);

      if (!result) {
        return;
      }

      setMergeGap(result.mergeGap);

      if (mergeScope === 'clip') {
        setScopedClips(result.clips ?? null);
      }

      setActiveClip(result.activeClip);

      const newActiveClip = result.clips?.[result.activeClip];

      if (newActiveClip) {
        requestClipPlayback(newActiveClip);
      }
    },
    [clips, displayClips, mergeScope, requestClipPlayback],
  );

  /*
   * Downward diagonal swipe: merge this clip with an adjacent one. Down-right
   * merges with the clip to the right, down-left with the clip to the left.
   */
  const handleClipSwipeDiagonalMerge = useCallback(
    (idx: number, dir: 'left' | 'right') => {
      if (dir === 'right') {
        if (idx + 1 < displayClips.length) {
          applyRangeMerge(idx, idx + 1);
        }
        return;
      }

      if (idx > 0) {
        applyRangeMerge(idx - 1, idx);
      }
    },
    [applyRangeMerge, displayClips.length],
  );

  /*
   * Upward diagonal swipes split the merged clip from the end the swipe is
   * pointing at: up-right detaches the rightmost part, up-left the leftmost.
   * The detached part is always at least `minClipLength`.
   */
  const handleClipSwipeSplitEnd = useCallback(
    (idx: number, side: 'left' | 'right') => {
      publishSplit(
        splitClipEnd(clips, displayClips, idx, side, mergeScope, minClipLength),
      );
    },
    [clips, displayClips, mergeScope, minClipLength, publishSplit],
  );

  /*
   * Two clips pinched together fuse the whole range between them, mirroring the
   * swipe-down merge but across many clips at once. "clip" scope replaces just
   * that range; "global" scope sets the threshold to the largest silence inside
   * the range and regroups the whole track.
   */
  const handleClipPinchMerge = useCallback(
    (low: number, high: number) => applyRangeMerge(low, high),
    [applyRangeMerge],
  );

  /*
   * Two fingers spread apart on one clip: the anti-snip, which runs the same
   * normal split as the swipe-up gesture.
   */
  const handleClipPinchSplit = useCallback(
    (idx: number) => {
      handleClipSwipe(idx, 'up');
    },
    [handleClipSwipe],
  );

  const handleClipSwipeGesture = useCallback(
    (idx: number, direction: SwipeDirection) => {
      if (direction === 'down-right' || direction === 'down-left') {
        handleClipSwipeDiagonalMerge(
          idx,
          direction === 'down-right' ? 'right' : 'left',
        );
        return;
      }

      if (direction === 'up-right' || direction === 'up-left') {
        handleClipSwipeSplitEnd(
          idx,
          direction === 'up-right' ? 'right' : 'left',
        );
        return;
      }

      handleClipSwipe(idx, direction);
    },
    [handleClipSwipe, handleClipSwipeDiagonalMerge, handleClipSwipeSplitEnd],
  );

  /*
   * ---------------------------------------------------------
   * MERGE SLIDER
   * ---------------------------------------------------------
   */

  /*
   * The merge slider is only shown in "global" scope, where it sets the single
   * threshold every clip is regrouped by. In "clip" scope merging happens per
   * clip through the swipe gestures instead.
   */
  const handleMergeGapChange = useCallback((gap: number) => {
    setMergeGap(gap);
  }, []);

  return (
    <>
      <div className="progress-container">
        {/*
         * -----------------------------------------------------
         * PAGE-FLIP VIEW SWITCH
         * -----------------------------------------------------
         *
         * Direct child of progress-container.
         *
         * progress-container should therefore have:
         *
         *   position: relative;
         *
         * WaveformViewFlipButton owns its visual appearance,
         * hover animation and theme-aware styling.
         */}
        {hasWaveform && (
          <WaveformViewFlipButton
            view={waveformView}
            onChange={handleWaveformViewChange}
          />
        )}

        {/*
         * -----------------------------------------------------
         * WAVEFORM
         * -----------------------------------------------------
         */}
        <div
          className={`progress-row ${
            waveformView === 'horizontal' ? 'progress-row--horizontal' : ''
          }`}
        >
          {waveformStatus === 'loading' || waveformStatus === 'idle' ? (
            <div className="waveform-loading waveform-loading--stacked">
              {t('waveform.loading')}
            </div>
          ) : waveformStatus === 'error' ? (
            <div className="waveform-loading waveform-loading--error waveform-loading--stacked">
              {t('waveform.unavailable')}
            </div>
          ) : hasWaveform && waveformView === 'horizontal' ? (
            <RowWaveform
              waveform={waveform!}
              displayClips={displayClips}
              currentTime={currentTime}
              onSeek={onSeek}
              onPlayRange={onPlayRange}
              onStopPlayback={onStopPlayback}
              repetitions={repetitions}
              activeClip={activeClip}
              onActiveClipChange={handleActiveClipChange}
              onSwipeClip={handleClipSwipeGesture}
              minClipLength={minClipLength}
              onPinchMergeClip={handleClipPinchMerge}
              onPinchSplitClip={handleClipPinchSplit}
              getAnalyser={getAnalyser}
              getCurrentTime={getCurrentTime}
              playing={playing}
              scrolling={scrolling}
              setScrolling={setScrolling}
              scrollTimeoutRef={scrollTimeoutRef}
              clipPlayRequest={clipPlayRequest}
            />
          ) : hasWaveform && waveformView === 'stacked' ? (
            <StackedWaveform
              waveform={waveform!}
              displayClips={displayClips}
              currentTime={currentTime}
              playing={playing}
              activeClip={activeClip}
              repetitions={repetitions}
              onSwipeClip={handleClipSwipeGesture}
              minClipLength={minClipLength}
              onPinchMergeClip={handleClipPinchMerge}
              onPinchSplitClip={handleClipPinchSplit}
              onSeek={onSeek}
              onPlayRange={onPlayRange}
              onStopPlayback={onStopPlayback}
              getCurrentTime={getCurrentTime}
              onActiveClipChange={handleActiveClipChange}
              clipPlayRequest={clipPlayRequest}
            />
          ) : null}
        </div>

        {/*
         * -----------------------------------------------------
         * EMPTY STATE
         * -----------------------------------------------------
         */}
        {hasWaveform && clips.length === 0 && (
          <div className="waveform-empty-hint" role="status">
            {t('waveform.noClips')}
          </div>
        )}

        {/*
         * -----------------------------------------------------
         * COLLAPSED TOOLBAR HIT AREA
         * -----------------------------------------------------
         *
         * Gesture handling lives in ClipToolbarCollapsedHit.
         */}
        {clips.length > 0 && !showAdvancedControls && (
          <ClipToolbarCollapsedHit />
        )}
      </div>

      {/*
       * -------------------------------------------------------
       * ADVANCED CLIP CONTROLS
       * -------------------------------------------------------
       */}
      {clips.length > 0 && showAdvancedControls && (
        <ClipToolbar
          mergeGap={mergeGap}
          clipCount={displayClips.length}
          onMergeGapChange={handleMergeGapChange}
          showMergeSlider={mergeScope === 'global'}
          repetitions={repetitions}
          onRepetitionsChange={handleRepetitionsChange}
          disabled={playing}
        />
      )}
    </>
  );
}
