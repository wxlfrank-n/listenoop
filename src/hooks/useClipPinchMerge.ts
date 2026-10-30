/**
 * Two-finger "snip" across clips, and its opposite on a single clip.
 *
 * When two pointers land on two different clips, the clips between them (both
 * ends included) merge if the fingers squeeze together -- the distance between
 * the pointers shrinks by at least PINCH_MERGE_THRESHOLD_PX -- before either
 * pointer is released.
 *
 * When two pointers land on the SAME clip, the gesture is an anti-snip: if the
 * fingers spread apart -- the distance grows by at least
 * PINCH_SPLIT_THRESHOLD_PX -- the clip performs its normal split.
 *
 * Both outcomes are decided on release (the finger lift that ends the
 * two-pointer phase), never mid-gesture, so a glance at the distance at the end
 * is enough.
 *
 * Detection lives on the waveform container (the element binding must contain
 * all clips): pointer events from both fingers bubble there, and the element
 * each pointer landed on is resolved through its `data-clip-idx` attribute.
 * Only pointers that land on a clip are tracked; a finger on the waveform
 * background does not form a candidate.
 *
 * While a pair is live, `clipPinchState.active` is set so the horizontal pan /
 * page drag stand down. Displacement is measured against the last known
 * position of the surviving pointer, tracked through window listeners.
 */

import {useCallback, useEffect, useRef} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';

import {
  PINCH_MERGE_THRESHOLD_PX,
  PINCH_SPLIT_THRESHOLD_PX,
  clipPinchState,
} from '../components/clipPinch';

interface ActivePointer {
  pointerId: number;
  /** Global clip index the pointer landed on. */
  clipIndex: number;
  x: number;
  y: number;
}

interface MergeCandidate {
  a: number;
  b: number;
  low: number;
  high: number;
  startDist: number;
  fired: boolean;
}

interface SplitCandidate {
  a: number;
  b: number;
  /** Global clip index shared by both pointers. */
  idx: number;
  startDist: number;
  fired: boolean;
}

const distance = (a: ActivePointer, b: ActivePointer) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const clipIndexAt = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return -1;

  const el = target.closest('[data-clip-idx]') as HTMLElement | null;
  const raw = el?.dataset.clipIdx;
  if (raw === undefined) return -1;

  const index = Number(raw);
  return Number.isInteger(index) ? index : -1;
};

export function useClipPinchMerge(
  onMerge?: (lowIndex: number, highIndex: number) => void,
  onSplit?: (clipIndex: number) => void,
) {
  /*
   * Latest callbacks without re-binding the window listeners, which should live
   * as long as the container does.
   */
  const onMergeRef = useRef(onMerge);
  onMergeRef.current = onMerge;

  const onSplitRef = useRef(onSplit);
  onSplitRef.current = onSplit;

  const pointersRef = useRef<Map<number, ActivePointer>>(new Map());
  const mergeCandidateRef = useRef<MergeCandidate | null>(null);
  const splitCandidateRef = useRef<SplitCandidate | null>(null);

  const handlePointerEnd = useCallback((e: PointerEvent) => {
    const map = pointersRef.current;
    const merge = mergeCandidateRef.current;
    const split = splitCandidateRef.current;
    const pointer = map.get(e.pointerId);

    if (
      split &&
      pointer &&
      (split.a === pointer.pointerId || split.b === pointer.pointerId)
    ) {
      const otherId = split.a === pointer.pointerId ? split.b : split.a;
      const other = map.get(otherId);
      const finalDist = other
        ? Math.hypot(e.clientX - other.x, e.clientY - other.y)
        : split.startDist;

      if (
        e.type !== 'pointercancel' &&
        !split.fired &&
        other &&
        finalDist - split.startDist >= PINCH_SPLIT_THRESHOLD_PX
      ) {
        split.fired = true;
        onSplitRef.current?.(split.idx);
      }
    }

    if (
      merge &&
      pointer &&
      (merge.a === pointer.pointerId || merge.b === pointer.pointerId)
    ) {
      const otherId = merge.a === pointer.pointerId ? merge.b : merge.a;
      const other = map.get(otherId);
      const finalDist = other
        ? Math.hypot(e.clientX - other.x, e.clientY - other.y)
        : merge.startDist;

      if (
        e.type !== 'pointercancel' &&
        !merge.fired &&
        finalDist <= merge.startDist &&
        merge.startDist - finalDist >= PINCH_MERGE_THRESHOLD_PX
      ) {
        merge.fired = true;
        onMergeRef.current?.(merge.low, merge.high);
      }
    }

    map.delete(pointer?.pointerId ?? e.pointerId);

    if (map.size < 2) {
      mergeCandidateRef.current = null;
      splitCandidateRef.current = null;
      clipPinchState.active = false;
    }
  }, []);

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const pointer = pointersRef.current.get(e.pointerId);
      if (pointer) {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
      pointersRef.current.clear();
      mergeCandidateRef.current = null;
      splitCandidateRef.current = null;
      clipPinchState.active = false;
    };
  }, [handlePointerEnd]);

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    /*
     * Disabled while there is nothing to merge/split (e.g. while playing), so
     * the horizontal pan / page drag keep full control then.
     */
    if (!onMergeRef.current && !onSplitRef.current) return;

    if (e.pointerType === 'mouse' && e.button !== 0) {
      return;
    }

    const clipIndex = clipIndexAt(e.target);
    if (clipIndex < 0) return;

    const map = pointersRef.current;
    map.set(e.pointerId, {
      pointerId: e.pointerId,
      clipIndex,
      x: e.clientX,
      y: e.clientY,
    });

    if (
      map.size === 2 &&
      !mergeCandidateRef.current &&
      !splitCandidateRef.current
    ) {
      const [a, b] = [...map.values()];
      if (!a || !b) return;
      if (a.clipIndex === b.clipIndex) {
        splitCandidateRef.current = {
          a: a.pointerId,
          b: b.pointerId,
          idx: a.clipIndex,
          startDist: distance(a, b),
          fired: false,
        };
      } else {
        mergeCandidateRef.current = {
          a: a.pointerId,
          b: b.pointerId,
          low: Math.min(a.clipIndex, b.clipIndex),
          high: Math.max(a.clipIndex, b.clipIndex),
          startDist: distance(a, b),
          fired: false,
        };
      }
      clipPinchState.active = true;
    }
  }, []);

  return {onPointerDown: handlePointerDown};
}
