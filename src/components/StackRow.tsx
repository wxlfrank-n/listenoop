/**
 * One row of the stacked waveform view.
 *
 * A row draws a slice of the waveform, the clips that fall inside it, and the
 * playhead cursor. It owns everything scoped to that slice -- the window both
 * layers draw over, the cursor's position within the row, and turning a click
 * into a seek -- leaving StackedWaveform to own paging and gestures.
 *
 * The row is memoized because it re-renders on every `currentTime` tick while
 * its siblings do not.
 */

import {memo, useCallback, useMemo} from 'react';

import {ClipLabel, clipLabelProps} from './ClipLabel';
import {Clips} from './Clips';
import {WaveformCanvas} from './Waveform';
import {WaveformCursor} from './WaveformCursor';
import {useConfig} from '../hooks/useConfig';

import type {SwipeDirection, WaveformData} from '../types';
import type {Clip as InitClipData} from '../utils/clips';

/** Virtual buffer width the waveform canvas draws at. */
const VB_W = 1000;
const VB_H = 200;
const PAD = 4;

export const INNER_H = VB_H - PAD * 2;

/** Tolerance for treating the final row as reaching the end of the track. */
const END_EPSILON = 1e-6;

/** Static base for the played-layer style; only `clipPath` changes per tick. */
const PLAYED_LAYER_BASE = {
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
} as const;

export interface StackedRow {
  start: number;
  end: number;
  clips: {
    clip: InitClipData;
    /** Index of this clip within the whole track, not just the row. */
    idx: number;
  }[];
}

export interface StackRowProps {
  row: StackedRow;
  /** Stable identity for the row, used as its React key. */
  gi: number;
  waveform: WaveformData;
  /** Minimum seconds a row shows, so short clips stay legible. */
  windowSecs: number;
  currentTime: number;
  playing: boolean;
  /** True while a clip is playing, which suppresses click-to-seek. */
  clipPlayActive: boolean;
  activeClip: number;
  repetitions: number;
  onStopPlayback?: () => void;
  onActivate: (idx: number) => void;
  onSwipeClip?: (idx: number, direction: SwipeDirection) => void;
  /** Minimum seconds a split must leave on each side; controls the affordance. */
  minClipLength?: number;
  onPlayRange: (start: number, end: number, repetitions: number) => void;
  onSeek: (time: number) => void;
  getCurrentTime: () => number;
  /**
   * Set when a horizontal page drag just finished, so the click that follows it
   * is swallowed instead of becoming a seek. Cleared by the first row click.
   */
  suppressClickRef: React.RefObject<boolean>;
}

export const StackRow = memo(
  ({
    row,
    gi,
    waveform,
    windowSecs,
    currentTime,
    playing,
    clipPlayActive,
    activeClip,
    repetitions,
    onStopPlayback,
    onActivate,
    onSwipeClip,
    minClipLength,
    onPlayRange,
    onSeek,
    getCurrentTime,
    suppressClickRef,
  }: StackRowProps) => {
    const {config} = useConfig();
    const theme = config.theme;
    const rowStart = row.start;

    const rowLen = Math.max(windowSecs, row.end - row.start);

    /*
     * Both the waveform and the clip layer draw over the same window, so it is
     * built once and shared. Memoized so `WaveformCanvas` (which is itself
     * memoized) does not see a new object identity on every render and re-render
     * its internal draw effect.
     */
    const rowWindow = useMemo(
      () => ({
        windowStartSec: rowStart,
        windowLen: rowLen,
        innerH: INNER_H,
        vbW: VB_W,
        vbH: VB_H,
      }),
      [rowStart, rowLen],
    );

    // `getPlayedPct` / `getCursorPct` are passed to `<WaveformCursor>`, which
    // lists them in its rAF effect's deps. Without `useCallback` the effect
    // tears down and rebuilds the rAF loop on every render — and since the
    // parent re-renders on every `timeupdate` tick during playback, that's a
    // per-frame teardown of the animation loop.
    const getPlayedPct = useCallback(
      () => Math.max(0, Math.min(1, (getCurrentTime() - rowStart) / rowLen)),
      [getCurrentTime, rowStart, rowLen],
    );

    const getCursorPct = useCallback(
      () => Math.min(getPlayedPct(), (row.end - rowStart) / rowLen),
      [getPlayedPct, row.end, rowStart, rowLen],
    );

    const playedPct = getPlayedPct();

    const isLastRow = row.end >= waveform.duration - END_EPSILON;

    /*
     * The cursor hides while the playhead is past this row, except on the final
     * row where it stays put at the end instead of disappearing.
     */
    const showCursor =
      currentTime >= rowStart &&
      (currentTime < row.end ||
        (isLastRow && currentTime >= row.end - END_EPSILON));

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        /*
         * A horizontal page drag must
         * never become a seek.
         */
        if (suppressClickRef.current) {
          suppressClickRef.current = false;

          return;
        }

        if (clipPlayActive) {
          return;
        }

        const rect = e.currentTarget.getBoundingClientRect();

        const f = Math.max(
          0,
          Math.min(1, (e.clientX - rect.left) / rect.width),
        );

        onSeek(rowStart + f * rowLen);
      },
      [suppressClickRef, clipPlayActive, onSeek, rowStart, rowLen],
    );

    // `getIdx` and `renderLabel` are passed to `<Clips>`; stabilize them so
    // `Clips` does not see a new function identity on every parent re-render
    // (which happens on every `timeupdate` tick during playback).
    const getIdx = useCallback(
      (_clip: InitClipData, i: number) => row.clips[i]?.idx ?? -1,
      [row.clips],
    );

    // `Clips` is memoized; give it a stable clips array identity so it only
    // re-renders when the row's clips actually change, not on every tick.
    const clipList = useMemo(
      () => row.clips.map(({clip}) => clip),
      [row.clips],
    );

    const renderLabel = useCallback(
      (id: number, clip: InitClipData) => (
        <ClipLabel
          key={`lbl-${id}`}
          {...clipLabelProps({
            id,
            clip,
            activeClip,
          })}
        />
      ),
      [activeClip],
    );

    return (
      <div key={gi} className="stacked-waveform__row" onClick={handleClick}>
        <WaveformCanvas
          className="stacked-waveform__svg"
          data={waveform.data}
          sampleRate={waveform.sampleRate}
          window={rowWindow}
          contentEndSec={row.end}
          theme={theme}
        />
        <div
          className="stacked-waveform__played"
          style={{
            ...PLAYED_LAYER_BASE,
            clipPath: `inset(0 ${100 - playedPct * 100}% 0 0)`,
          }}
        >
          <WaveformCanvas
            className="stacked-waveform__svg stacked-waveform__svg--played"
            data={waveform.data}
            sampleRate={waveform.sampleRate}
            window={rowWindow}
            contentEndSec={row.end}
            colorVar="--waveform-bar-played"
            theme={theme}
          />
        </div>
        <div className="stacked-waveform__clip-layer">
          <Clips
            clips={clipList}
            window={rowWindow}
            onPlayRange={onPlayRange}
            repetitions={repetitions}
            playing={playing}
            onStopPlayback={onStopPlayback}
            activeClip={activeClip}
            onActivate={onActivate}
            onSwipe={onSwipeClip}
            minClipLength={minClipLength}
            getIdx={getIdx}
            renderLabel={renderLabel}
          />
        </div>

        {showCursor && (
          <WaveformCursor
            view="stacked"
            getPlayedPct={getCursorPct}
            getCurrentTime={getCurrentTime}
          />
        )}
      </div>
    );
  },
);
