/**
 * Advanced clip controls toolbar.
 *
 * Rendered below the waveform when clips exist and advanced controls are
 * expanded (store `showAdvancedControls`). Holds the merge-gap slider and the
 * repeat stepper. Collapses via a swipe down; the collapsed hit area that
 * re-expands it lives inside progress-container.
 */
import {useRef} from 'react';
import {useDrag} from '@use-gesture/react';

import {MergeSlider} from './MergeSlider';
import {RepsStepper} from './RepsStepper';

import {useAppDispatch} from '../store/hooks';
import {updateConfig} from '../store/configSlice';

import './ClipToolbar.css';

/** Vertical distance (px) that counts as a swipe to hide the toolbar. */
export const TOOLBAR_SWIPE_THRESHOLD_PX = 24;

const SCOPE_DOUBLE_CLICK_MS = 500;
const SCOPE_DOUBLE_CLICK_DISTANCE_PX = 12;

interface ClipToolbarProps {
  /** Snapped merge gap (seconds) applied to the clips. */
  mergeGap: number;
  /** Number of clips after merging, shown by the slider. */
  clipCount: number;
  /** Reports a new merge gap whenever the user adjusts it. */
  onMergeGapChange: (gap: number) => void;
  /** Repeat count for clicked clips. */
  repetitions: number;
  /** Reports a new repeat count whenever the user steps it. */
  onRepetitionsChange: (value: number) => void;
  /**
   * Whether to show the merge-gap slider.
   *
   * In "clip" scope there is no single track-wide gap to adjust, so the slider
   * is hidden and merging happens per clip through the swipe gestures.
   */
  showMergeSlider?: boolean;
  /** Disables the controls (e.g. while playing). */
  disabled?: boolean;
}

export function ClipToolbar({
  mergeGap,
  clipCount,
  onMergeGapChange,
  repetitions,
  onRepetitionsChange,
  showMergeSlider = true,
  disabled = false,
}: ClipToolbarProps) {
  const dispatch = useAppDispatch();
  const lastScopeClick = useRef<{
    time: number;
    x: number;
    y: number;
    showMergeSlider: boolean;
  } | null>(null);

  /*
   * Swipe down (vertical, downward) hides the toolbar.
   */
  const bindToolbar = useDrag(
    ({last, event, initial}) => {
      if (!last) return;

      /*
       * Use the pointer position of the releasing event rather than the
       * accumulated `movement`: a fast gesture may deliver pointerup at a new
       * position without an intermediate pointermove.
       */
      const pointer = event as PointerEvent;

      const dy = pointer.clientY - initial[1];
      const absY = Math.abs(dy);
      const absX = Math.abs(pointer.clientX - initial[0]);

      if (absY >= TOOLBAR_SWIPE_THRESHOLD_PX && absY > absX && dy > 0) {
        dispatch(
          updateConfig({
            showAdvancedControls: false,
          }),
        );
      }
    },
    {
      pointer: {capture: false, buttons: -1, keys: false},
    },
  );

  return (
    <div
      className={`clip-toolbar ${showMergeSlider ? '' : 'clip-toolbar--clip-scope'} ${disabled ? 'clip-toolbar--disabled' : ''}`}
      {...bindToolbar()}
      onClick={event => {
        const {target, currentTarget, timeStamp, clientX, clientY} = event;
        const targetClass = showMergeSlider
          ? 'clip-toolbar__scope-gap'
          : 'clip-reps';
        const hitScopeArea =
          (!showMergeSlider && target === currentTarget) ||
          (target instanceof HTMLElement &&
            target.classList.contains(targetClass));
        const previous = lastScopeClick.current;
        lastScopeClick.current = null;
        if (!hitScopeArea) return;

        if (
          previous?.showMergeSlider === showMergeSlider &&
          timeStamp - previous.time <= SCOPE_DOUBLE_CLICK_MS &&
          Math.hypot(clientX - previous.x, clientY - previous.y) <=
            SCOPE_DOUBLE_CLICK_DISTANCE_PX
        ) {
          dispatch(
            updateConfig({mergeScope: showMergeSlider ? 'clip' : 'global'}),
          );
          return;
        }

        lastScopeClick.current = {
          time: timeStamp,
          x: clientX,
          y: clientY,
          showMergeSlider,
        };
      }}
    >
      {showMergeSlider && (
        <MergeSlider
          value={mergeGap}
          clipCount={clipCount}
          onChange={onMergeGapChange}
          disabled={disabled}
        />
      )}

      {showMergeSlider && (
        <div className="clip-toolbar__scope-gap" aria-hidden="true" />
      )}

      <RepsStepper
        value={repetitions}
        onChange={onRepetitionsChange}
        disabled={disabled}
        // The merge row and the repeat row share a single line: drop the
        // label while the merge control is present, and keep it (centred)
        // when the repeats are the only control.
        showLabel={!showMergeSlider}
      />
    </div>
  );
}
