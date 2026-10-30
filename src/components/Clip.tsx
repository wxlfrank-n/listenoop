/**
 * Renders one detected audio clip as an interactive
 * overlay on the waveform.
 *
 * Gesture ownership:
 *
 * tap
 *   -> activate / play this clip
 *
 * vertical swipe
 *   -> split / merge
 *
 * diagonal swipe (15-75 deg)
 *   -> down-right: merge with the clip to the right
 *   -> down-left: merge with the clip to the left
 *   -> up-right: split the rightmost part of the merged clip
 *   -> up-left: split the leftmost part of the merged clip
 *
 * horizontal drag
 *   -> NOT handled here
 *   -> observed by the waveform container
 *   -> RowWaveform scrolls
 *   -> StackedWaveform changes page
 *
 * The drag gesture never captures the pointer on pointer-down
 * (`pointer: {capture: false}`): at that moment we do not yet know
 * whether the user intends a vertical clip gesture or horizontal
 * navigation, so the waveform parent must keep observing the pointer too.
 */

import {memo, useEffect, useRef, useState, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {useDrag} from '@use-gesture/react';
import {useT} from '../i18n';

import {clipGestureLedger} from './clipPinch';

import type {Clip as InitClipData} from '../utils/clips';
import type {SwipeDirection, WaveWindow} from '../types';

import './Clip.css';

export interface ClipProps {
  clip: InitClipData;

  window: WaveWindow;

  /** Global clip index. */
  id: number;

  active: boolean;

  /**
   * Whether the clip can currently be split (it is a merged group with a
   * boundary that cleaves off at least `minSplitPieceSec`). Drives the split
   * affordance shown while the clip is active, and whether an up-swipe shows
   * the floating split icon.
   */
  canSplit?: boolean;

  label?: ReactNode;

  onPlayRange: (start: number, end: number, repetitions: number) => void;

  repetitions: number;

  playing: boolean;

  onStopPlayback?: () => void;

  onActivate: (idx: number) => void;

  onSwipe?: (idx: number, direction: SwipeDirection) => void;
}

const SWIPE_THRESHOLD_PX = 10;
const TAP_THRESHOLD_PX = 4;

/*
 * Diagonal band boundaries, expressed as the slope of |dy|/|dx| (tan of the
 * angle from the horizontal):
 *
 *   |dy|/|dx| <                 tan(15 deg) -> horizontal scroll (parent owns)
 *   tan(15 deg) <= |dy|/|dx| <= tan(75 deg) -> diagonal clip gesture
 *   |dy|/|dx| >                 tan(75 deg) -> vertical swipe
 *
 * Each gesture direction is a 60-degree slice:
 *
 *   0-15 / 345-360 -> right scroll, 165-195 -> left scroll
 *   15-75          -> up-right, 105-165 -> up-left
 *   75-105         -> up / split, 255-285 -> down / merge
 *   105-165        -> up-left, 195-255 -> down-left
 *   285-345        -> down-right
 */
export const DIAGONAL_MIN_TAN = Math.tan((15 * Math.PI) / 180);
export const DIAGONAL_MAX_TAN = Math.tan((75 * Math.PI) / 180);

/**
 * Decide which clip gesture (if any) a displacement describes. Mirrors the
 * swipe rules used on release, so a mid-drag read always matches what its
 * commit will do.
 */
const classifyClipSwipe = (dx: number, dy: number): SwipeDirection | null => {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const ratio = absX > 0 ? absY / absX : Infinity;

  /*
   * Diagonal swipes (15-75 degrees from the horizontal):
   *
   *   down-right -> merge with the clip to the right
   *   down-left  -> merge with the clip to the left
   *   up-right   -> split the rightmost part of the merged clip
   *   up-left    -> split the leftmost part of the merged clip
   *
   * Clip owns these gestures, like the vertical swipe. Checked before the
   * vertical band so the 15-75 deg slice never falls through to one of the
   * plain up/down swipes.
   */
  if (
    dx > 0 &&
    Math.hypot(dx, dy) >= SWIPE_THRESHOLD_PX &&
    ratio >= DIAGONAL_MIN_TAN &&
    ratio <= DIAGONAL_MAX_TAN
  ) {
    return dy > 0 ? 'down-right' : 'up-right';
  }

  if (
    dx < 0 &&
    dy > 0 &&
    Math.hypot(dx, dy) >= SWIPE_THRESHOLD_PX &&
    ratio >= DIAGONAL_MIN_TAN &&
    ratio <= DIAGONAL_MAX_TAN
  ) {
    return 'down-left';
  }

  if (
    dx < 0 &&
    dy < 0 &&
    Math.hypot(dx, dy) >= SWIPE_THRESHOLD_PX &&
    ratio >= DIAGONAL_MIN_TAN &&
    ratio <= DIAGONAL_MAX_TAN
  ) {
    return 'up-left';
  }

  /*
   * Vertical swipe:
   *
   * Clip owns this gesture.
   */
  if (absY >= SWIPE_THRESHOLD_PX && ratio > DIAGONAL_MAX_TAN) {
    return dy < 0 ? 'up' : 'down';
  }

  return null;
};

export const Clip = memo(
  ({
    clip,
    window,
    id,
    active,
    canSplit = true,
    label,
    onPlayRange,
    repetitions,
    playing,
    onStopPlayback,
    onActivate,
    onSwipe,
  }: ClipProps) => {
    const {windowStartSec, windowLen, innerH, vbH} = window;
    const t = useT();

    const suppressClickRef = useRef(false);

    /*
     * Gesture the current drag has been classified as (up -> split, down ->
     * merge), or null when no clip gesture is in progress. Drives the action
     * icon shown while swiping; it is cleared as soon as the pointer lifts.
     */
    const [swipeDir, setSwipeDir] = useState<SwipeDirection | null>(null);

    /*
     * Viewport coordinates of the finger during a clip gesture. The action icon
     * is rendered here (above the fingertip) instead of centred on the clip, so
     * the hand never covers it. Null when no gesture is classified.
     */
    const [hintPos, setHintPos] = useState<{x: number; y: number} | null>(null);

    /*
     * True when another clip pointer was already down when this one landed.
     * Such a pointer can never become a tap, whatever it does afterwards.
     */
    const multiPointerRef = useRef(false);

    /*
     * Pointers this component registered in the shared ledger. If the clip
     * unmounts mid-gesture (e.g. a pinch merge replaces the clips while the
     * second finger is still down), `last` never runs for that pointer, so the
     * entry must be cleaned here or every later tap would be suppressed.
     */
    const pointerIdsRef = useRef<Set<number>>(new Set());
    useEffect(
      () => () => {
        for (const pointerId of pointerIdsRef.current) {
          clipGestureLedger.active.delete(pointerId);
        }
        if (clipGestureLedger.active.size === 0) {
          clipGestureLedger.multi = false;
          clipGestureLedger.clipSwipeLocked = false;
        }
      },
      [],
    );

    /*
     * Clip band occupies the middle half of the
     * waveform vertically.
     */
    const topPct = ((vbH / 2 - innerH / 4) / vbH) * 100;

    const heightPct = (innerH / 2 / vbH) * 100;

    const leftPct = ((clip.vStart - windowStartSec) / windowLen) * 100;

    const widthPct = Math.max(
      0.2,
      ((clip.vEnd - clip.vStart) / windowLen) * 100,
    );

    const activateClip = () => {
      if (playing && active) {
        onStopPlayback?.();

        return;
      }

      onActivate(id);

      onPlayRange(clip.vStart, clip.vEnd, repetitions);
    };

    /*
     * ---------------------------------------------------------
     * TAP / SWIPE
     * ---------------------------------------------------------
     *
     * `pointer: {capture: false}` is deliberate: Clip must NOT capture the
     * pointer on pointer-down. Both Clip and its waveform parent need to
     * observe the movement until the gesture direction becomes clear.
     *
     * `buttons: -1` keeps the historical behavior of reacting to any button.
     */
    const bindClip = useDrag(
      ({first, last, event, initial, target, currentTarget}) => {
        if (first) {
          suppressClickRef.current = false;

          setSwipeDir(null);
          setHintPos(null);

          const pointerId = (event as PointerEvent).pointerId;

          multiPointerRef.current = clipGestureLedger.active.size > 0;
          if (multiPointerRef.current) {
            /*
             * A second finger landing on another clip is part of a multi-finger
             * gesture (e.g. the pinch merge): it must never be read as a tap.
             */
            suppressClickRef.current = true;
          } else {
            /*
             * First pointer of a fresh session: no clip gesture is latched yet,
             * so the parent pan/page drag may observe the movement until this
             * clip decides it owns the gesture.
             */
            clipGestureLedger.clipSwipeLocked = false;
          }
          clipGestureLedger.active.add(pointerId);
          pointerIdsRef.current.add(pointerId);
          if (clipGestureLedger.active.size > 1) {
            clipGestureLedger.multi = true;
          }

          return;
        }

        /*
         * Use the pointer position of the current event rather than the
         * accumulated `movement`: a fast gesture may deliver its releasing
         * event at a new position without an intermediate pointermove, and
         * use-gesture accumulates movement only on pointermove.
         */
        const pointer = event as PointerEvent;

        const dx = pointer.clientX - initial[0];

        const dy = pointer.clientY - initial[1];

        if (!last) {
          /*
           * Once a move clearly reads as a clip gesture, the clip owns the
           * pointer: stand the parent's horizontal pan/page drag down so it
           * cannot scroll the viewport while this finger is still dragging.
           * The lock is only cleared when the gesture ends (see below).
           */
          const dir = classifyClipSwipe(dx, dy);

          if (dir) {
            clipGestureLedger.clipSwipeLocked = true;
            setSwipeDir(prev => (prev === dir ? prev : dir));
            setHintPos({x: pointer.clientX, y: pointer.clientY});
          }

          return;
        }

        /*
         * Whatever ends the gesture, this pointer is no longer down.
         */
        pointerIdsRef.current.delete(pointer.pointerId);
        clipGestureLedger.active.delete(pointer.pointerId);
        if (clipGestureLedger.active.size === 0) {
          clipGestureLedger.multi = false;

          /*
           * Last pointer up/cancelled: the clip no longer owns any gesture, so
           * the parent pan/page drag may take the next drag as it always did.
           */
          clipGestureLedger.clipSwipeLocked = false;
        }

        setSwipeDir(null);
        setHintPos(null);

        if (event.type === 'pointercancel') {
          suppressClickRef.current = true;

          return;
        }

        /*
         * A tap is only a tap when this pointer never overlapped another clip
         * pointer. `multi` covers sessions that started (and ended) here; the
         * ref covers the case where this pointer joined late.
         */
        if (multiPointerRef.current || clipGestureLedger.multi) {
          suppressClickRef.current = true;

          return;
        }

        const direction = classifyClipSwipe(dx, dy);

        if (direction) {
          suppressClickRef.current = true;

          onSwipe?.(id, direction);

          return;
        }

        const absX = Math.abs(dx);

        const absY = Math.abs(dy);

        /*
         * Horizontal movement:
         *
         * The parent waveform owns horizontal navigation.
         *
         * StackedWaveform:
         *   swipe left  -> next page
         *   swipe right -> previous page
         *
         * RowWaveform:
         *   horizontal pan
         */
        if (absX >= TAP_THRESHOLD_PX) {
          suppressClickRef.current = true;

          return;
        }

        /*
         * Small vertical movement that isn't a swipe
         * shouldn't accidentally become a tap.
         */
        if (absY >= TAP_THRESHOLD_PX) {
          suppressClickRef.current = true;

          return;
        }

        /*
         * Genuine tap.
         */
        suppressClickRef.current = true;

        if (target !== currentTarget) {
          return;
        }
        activateClip();
      },
      {
        pointer: {capture: false, buttons: -1, keys: false},
      },
    );

    /*
     * Browsers may synthesize a click after pointerup.
     *
     * The tap has already been handled above, so suppress
     * that synthetic click.
     */
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();

      if (suppressClickRef.current) {
        suppressClickRef.current = false;

        return;
      }

      /*
       * Keyboard / accessibility generated click.
       */
      activateClip();
    };

    /*
     * Action icon shown while the drag is classified as a clip gesture. Named
     * after the gesture's effect, so a diagonal still reads as its split/merge
     * meaning. A split is only offered when the clip can actually be split, so
     * an up-swipe on an unsplittable clip shows no icon (and no drag state).
     */
    let swipeAction: 'split' | 'merge' | null = null;

    if (swipeDir?.startsWith('up')) {
      swipeAction = canSplit ? 'split' : null;
    } else if (swipeDir) {
      swipeAction = 'merge';
    }

    return (
      <div
        className={`waveform-clip ${active ? 'waveform-clip--active' : ''} ${
          swipeAction ? 'waveform-clip--swiping' : ''
        }`}
        data-clip-idx={id}
        role="button"
        tabIndex={0}
        aria-label={
          active
            ? `Clip ${id + 1}, active — press Enter to toggle playback`
            : `Clip ${id + 1} — press Enter to play`
        }
        aria-pressed={active}
        style={{
          left: `${leftPct}%`,
          top: `${topPct}%`,
          width: `${widthPct}%`,
          height: `${heightPct}%`,
        }}
        onClick={handleClick}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activateClip();
          }
        }}
        {...bindClip()}
      >
        {active && canSplit && !swipeAction && (
          <span
            className="waveform-clip__split-hint waveform-clip__action-chip"
            role="img"
            aria-label={t('waveform.splittable')}
          >
            ✂️
          </span>
        )}

        {swipeAction &&
          hintPos &&
          createPortal(
            <span
              className="waveform-clip__swipe-hint waveform-clip__action-chip"
              style={{left: hintPos.x, top: hintPos.y}}
              aria-hidden="true"
            >
              {swipeAction === 'split' ? '✂️' : '🔗'}
            </span>,
            document.body,
          )}

        {label}
      </div>
    );
  },
);
