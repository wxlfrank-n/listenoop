import {
  mergeClipPair,
  mergeClipsByGap,
  MIN_SPLIT_PIECE_SEC,
  splitClipAtEnd,
  splitClipAtLargestGap,
  type Clip,
} from './clips';
import type {MergeScope} from '../types';

/**
 * Index of the group that begins at (or after) the split clip's first child.
 *
 * `mergeClipsByGap` keeps the list sorted by start, and the boundary gap is no
 * longer merged, so the piece that replaces the split group starts exactly at
 * `target.start`. Comparing in this direction -- rather than "starts before"
 * -- matters: lowering the merge gap also breaks up earlier groups, which
 * shifts the split group to a higher index.
 */
const groupContaining = (groups: Clip[], target: Clip) =>
  groups.findIndex(group => group.start >= target.start);

/**
 * Index of the group that encloses `target`.
 *
 * Merging absorbs an adjacent group, so the new group starts *before* `target`
 * and ends after it. That makes the "starts at or after" search above land on
 * the following group, so merging scans from the other end: the last group
 * starting at or before `target.start`.
 */
const groupEnclosing = (groups: Clip[], target: Clip) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i]!.start <= target.start) return i;
  }
  return -1;
};

export interface ClipSplitResult {
  mergeGap: number;
  activeClip: number;
  clips?: Clip[];

  /**
   * The two groups the selected clip was cut into. Available in both scopes so
   * the UI can highlight exactly what the split produced.
   */
  pieces: Clip[];
}

/**
 * Shared post-split bookkeeping for the largest-gap and directional splits.
 *
 * "clip" scope replaces exactly the selected group with its two pieces and
 * leaves every other group alone. "global" scope instead sets the merge gap
 * just below the chosen boundary and regroups the whole track, so other groups
 * can break up at thinner silences too.
 */
function finishSplit(
  clips: Clip[],
  displayClips: Clip[],
  idx: number,
  scope: MergeScope,
  split: {pieces: Clip[]; gap: number},
  clip: Clip,
): ClipSplitResult | null {
  if (scope === 'clip') {
    return {
      clips: [
        ...displayClips.slice(0, idx),
        ...split.pieces,
        ...displayClips.slice(idx + 1),
      ],
      mergeGap: split.gap,
      activeClip: idx,
      pieces: split.pieces,
    };
  }

  // Put the threshold immediately below this gap so that boundary
  // is no longer merged.
  const mergeGap = Math.max(0, split.gap - 0.000001);

  const nextClips = mergeClipsByGap(clips, mergeGap);

  const activeClip = groupContaining(nextClips, clip.children![0]!);

  return nextClips.length > 0
    ? {
        clips: nextClips,
        mergeGap,
        activeClip: activeClip === -1 ? 0 : activeClip,
        pieces: split.pieces,
      }
    : null;
}

/**
 * Swipe up (unpack): split a virtually merged clip at its largest child gap.
 *
 * "clip" scope cuts the selected group in two and leaves every other group
 * exactly as it is. "global" scope instead sets the merge gap just below that
 * same gap and regroups the whole track, so other groups can break up too.
 *
 * Either way the chosen boundary is the largest gap between children, so both
 * scopes agree on where to cut. Both scopes skip gaps that would leave either
 * side shorter than the configured `minPieceSec` floor, and the gesture fails
 * when none are left.
 */
export function splitClip(
  clips: Clip[],
  displayClips: Clip[],
  idx: number,
  scope: MergeScope = 'clip',
  minPieceSec: number = MIN_SPLIT_PIECE_SEC,
): ClipSplitResult | null {
  const clip = displayClips[idx];
  if (!clip) return null;

  const split = splitClipAtLargestGap(clip, minPieceSec);

  if (!split) return null;

  return finishSplit(clips, displayClips, idx, scope, split, clip);
}

/**
 * Directional split: break the piece off one end of a merged clip.
 *
 * Swipe up-right splits the rightmost part, up-left splits the leftmost part.
 * Each end's piece is the smallest valid one there, so a child shorter than
 * `minPieceSec` is absorbed into its neighbours until the accumulated piece
 * clears the floor. Both scopes behave like `splitClip`, cutting that single
 * boundary.
 */
export function splitClipEnd(
  clips: Clip[],
  displayClips: Clip[],
  idx: number,
  side: 'left' | 'right',
  scope: MergeScope = 'clip',
  minPieceSec: number = MIN_SPLIT_PIECE_SEC,
): ClipSplitResult | null {
  const clip = displayClips[idx];
  if (!clip) return null;

  const split = splitClipAtEnd(clip, side, minPieceSec);

  if (!split) return null;

  return finishSplit(clips, displayClips, idx, scope, split, clip);
}

export interface ClipMergeResult {
  /** The full clip list after merging `idx` with its nearest neighbor. */
  clips: Clip[];
  /** Index of the newly merged group in `clips`. */
  activeClip: number;
  /** The silence separating the selected clip from its nearest neighbor. */
  mergeGap: number;
}

/**
 * Swipe down (pack): merge the clip at `idx` with its nearest neighbor (the
 * adjacent group with the smallest inter-group gap), combining their children
 * into a single parent. The merge slider follows the silence used for that pair.
 *
 * "clip" scope merges exactly that one pair and leaves every other group as it
 * is. "global" scope instead applies that gap to the raw detection result across
 * the whole track, so other groups can merge too.
 */
export function mergeClips(
  clips: Clip[],
  displayClips: Clip[],
  idx: number,
  scope: MergeScope = 'clip',
): ClipMergeResult | null {
  const clip = displayClips[idx];
  if (!clip) return null;

  const previous = displayClips[idx - 1];
  const next = displayClips[idx + 1];
  const previousGap = previous ? clip.start - previous.end : Infinity;
  const nextGap = next ? next.start - clip.end : Infinity;
  const neighborIdx = previousGap <= nextGap ? idx - 1 : idx + 1;
  const neighbor = displayClips[neighborIdx];
  if (!neighbor) return null;
  const mergeGap = Math.min(previousGap, nextGap);

  if (scope === 'clip') {
    const merged = mergeClipPair(
      displayClips[Math.min(idx, neighborIdx)]!,
      displayClips[Math.max(idx, neighborIdx)]!,
    );

    return {
      clips: [
        ...displayClips.slice(0, Math.min(idx, neighborIdx)),
        merged,
        ...displayClips.slice(Math.max(idx, neighborIdx) + 1),
      ],
      activeClip: Math.min(idx, neighborIdx),
      mergeGap,
    };
  }

  const result = mergeClipsByGap(clips, mergeGap);

  /*
   * The merged pair is one group starting at `min(clip.start, neighbor.start)`,
   * which is at or before `clip.start`, so scanning back from the end lands on
   * the pair itself.
   */
  const activeClip = groupEnclosing(result, clip);

  return {clips: result, activeClip, mergeGap};
}

export interface ClipRangeMergeResult {
  /** The full clip list after fusing the range. */
  clips?: Clip[];
  /** Index of the fused range in `clips`. */
  activeClip: number;
  /** The largest silence inside the fused range. */
  mergeGap: number;
}

/**
 * Pinch merge: fuse every clip from `low` to `high` (inclusive) into one group.
 *
 * "clip" scope replaces exactly that range with a single parent and leaves
 * every other group untouched. "global" scope instead sets the merge gap to the
 * largest silence inside the range and regroups the whole track, so clips
 * across the range fuse (and other clips can fuse in as well, like the swipe
 * merge). Both scopes report that largest internal silence as `mergeGap`.
 */
export function mergeClipRange(
  clips: Clip[],
  displayClips: Clip[],
  low: number,
  high: number,
  scope: MergeScope = 'clip',
): ClipRangeMergeResult | null {
  const first = displayClips[low];
  if (!first || low >= high) return null;

  let mergeGap = 0;
  for (let i = low; i < high; i++) {
    const gap = displayClips[i + 1]!.start - displayClips[i]!.end;
    if (gap > mergeGap) mergeGap = gap;
  }

  if (scope === 'clip') {
    let merged = first;
    for (let i = low + 1; i <= high; i++) {
      merged = mergeClipPair(merged, displayClips[i]!);
    }

    return {
      clips: [
        ...displayClips.slice(0, low),
        merged,
        ...displayClips.slice(high + 1),
      ],
      mergeGap,
      activeClip: low,
    };
  }

  const result = mergeClipsByGap(clips, mergeGap);

  /*
   * The fused range starts at `first.start`, so the enclosing group is the last
   * group starting at or before it.
   */
  const activeClip = groupEnclosing(result, first);

  return {clips: result, activeClip, mergeGap};
}
