/**
 * Renders detected audio clips inside a waveform window.
 *
 * Responsibilities:
 * - Filters clips outside the current waveform window.
 * - Maps local clip indices to global clip indices.
 * - Renders the individual Clip components.
 * - Supplies labels and interaction callbacks.
 *
 * Gesture handling itself belongs to Clip:
 * - tap              -> activate/play
 * - vertical swipe   -> split/merge
 *
 * Horizontal dragging is deliberately NOT handled here.
 * It bubbles to the waveform container so RowWaveform or
 * StackedWaveform can perform scrolling/paging.
 */

import {memo, type ReactNode} from 'react';

import {splitClipAtLargestGap, type Clip as InitClipData} from '../utils/clips';
import type {SwipeDirection, WaveWindow} from '../types';

import {Clip} from './Clip';

interface ClipsProps {
  clips: InitClipData[];

  window: WaveWindow;

  onPlayRange: (start: number, end: number, repetitions: number) => void;

  repetitions: number;

  playing: boolean;

  onStopPlayback?: () => void;

  activeClip: number;

  onActivate: (idx: number) => void;

  onSwipe?: (idx: number, direction: SwipeDirection) => void;

  /**
   * Floor a split must leave on each side. Clips with no viable boundary are
   * rendered as unsplittable. The player supplies its configured minimum.
   */
  minClipLength?: number;

  /**
   * Maps a clip's local position in `clips` to its global
   * clip index.
   *
   * This allows StackedWaveform to render only the clips
   * belonging to one row while activation/swipe callbacks
   * still receive the global clip index.
   *
   * Default: local array index.
   */
  getIdx?: (clip: InitClipData, indexInArray: number) => number;

  /**
   * Optional content rendered inside each Clip.
   */
  renderLabel?: (
    id: number,
    clip: InitClipData,
    indexInArray: number,
  ) => ReactNode;
}

export const Clips = memo(
  ({
    clips,
    window,
    onPlayRange,
    repetitions,
    playing,
    onStopPlayback,
    activeClip,
    onActivate,
    onSwipe,
    minClipLength = 0,
    getIdx,
    renderLabel,
  }: ClipsProps) => {
    const {windowStartSec, windowLen} = window;

    const windowEndSec = windowStartSec + windowLen;

    return (
      <>
        {clips.map((clip, indexInArray) => {
          /*
           * Skip clips completely outside the rendered
           * waveform window.
           */
          if (clip.vEnd <= windowStartSec || clip.vStart >= windowEndSec) {
            return null;
          }

          const id = getIdx ? getIdx(clip, indexInArray) : indexInArray;

          const canSplit = splitClipAtLargestGap(clip, minClipLength) !== null;

          return (
            <Clip
              key={id}
              clip={clip}
              window={window}
              id={id}
              active={id === activeClip}
              canSplit={canSplit}
              label={renderLabel?.(id, clip, indexInArray)}
              onPlayRange={onPlayRange}
              repetitions={repetitions}
              playing={playing}
              onStopPlayback={onStopPlayback}
              onActivate={onActivate}
              onSwipe={onSwipe}
            />
          );
        })}
      </>
    );
  },
);
