/**
 * Silence-based clip detection.
 *
 * Explodes raw decoded audio into discrete clips by splitting around silent
 * gaps. Detection is block-based: the buffer is divided into fixed-width
 * windows and each window is classified sound/silent by its peak amplitude.
 *
 * Two user-configurable knobs are independent of one another:
 * - blockMs          - width of the quantization window, in milliseconds
 *                   (converted to samples via the sample rate)
 * - silenceRatio   - window whose peak <= ratio * trackPeak counts as silence
 *                   (how QUIET, not how short)
 */

/** A single detected audio segment, in seconds. */
export interface Clip {
  start: number;
  end: number;
  vStart: number;
  vEnd: number;
  /** Original clips kept under a virtually merged parent. */
  children?: Clip[];
  expanded?: boolean;
}

/** User-supplied silence-split parameters (config-driven). */
export interface SplitOptions {
  /** Block size in milliseconds. Controls the quantization of clip boundaries. */
  blockMs: number;
  /** A block whose peak is <= this ratio of the track peak counts as silence. */
  silenceRatio: number;
  /**
   * Minimum clip length, in seconds, that `getInitClipData` *attempts* to
   * achieve by merging short runs into neighbors. Not a guarantee: a lone
   * short run, runs that only clear `mustMergeThan`, and the unmerged fallback
   * in `findMinMergeGap` can all leave final clips shorter than this.
   */
  minClipLength: number;
  /**
   * Smallest piece a clip may be left alone as, in seconds. Detection merges
   * any run below this with a neighbor no matter what surrounds it (passed
   * through as `mustMergeThan`), so nothing this short survives on its own.
   */
  minSplitPieceSec: number;
}

export interface InitClipData {
  clips: Clip[];
  gaps: number[];
  minGap: number;
}

/**
 * Split raw decoded audio into clips. Each contiguous run of blocks whose peak
 * exceeds `silenceRatio * trackPeak` becomes a clip, bounded by silent blocks.
 */
export function getInitClipData(
  data: Float32Array | null,
  sampleRate: number,
  options: SplitOptions,
): InitClipData {
  if (!data || data.length === 0 || sampleRate <= 0)
    return {clips: [], minGap: 0, gaps: []};

  const audioDuration = data.length / sampleRate;
  // min blockSamples = 64 to avoid a pathological case where a single block is
  // too short to compute a meaningful peak. blockMs is converted via the sample
  // rate: e.g. 10ms at 48kHz is 480 samples.
  const blockSamples = Math.max(
    64,
    Math.round((options.blockMs / 1000) * sampleRate),
  );
  // silenceRatio is clamped to [0.0001, 0.02] so a single block can't be
  // misclassified as silence due to a single sample being quiet. A 0.02 ratio
  // is ~-34 dB, which is already very quiet.
  const silenceRatio = Math.min(0.02, Math.max(0.0001, options.silenceRatio));

  // peakStride is the number of samples to skip when computing the peak of a
  // block. A smaller stride gives a more accurate peak, but takes longer to
  // compute. A larger stride is faster, but may miss short bursts of sound.
  // The default is 1/8 of the block size, which is a good compromise.
  const peakStride = Math.max(1, Math.round(blockSamples / 8));
  // number of blocks in the audio buffer, rounded up to include a partial block
  const numBlocks = Math.ceil(data.length / blockSamples);
  // how long each block is in seconds, used to convert block indices to time
  const blockSec = blockSamples / sampleRate;

  // Per-block peak amplitudes, computed over every peakStride-th sample so a
  // ~3.7M-sample track reads ~7k values instead of one iteration per sample.
  // A sub-block burst still spans many samples, so bursts are caught too.
  const blockPeak = new Float32Array(numBlocks);
  for (let b = 0; b < numBlocks; b++) {
    const i0 = b * blockSamples;
    const i1 = Math.min(i0 + blockSamples, data.length);
    let peak = 0;
    for (let i = i0; i < i1; i += peakStride) {
      const v = data[i]!;
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
    blockPeak[b] = peak;
  }

  // Track peak is the maximum of all block peaks, used to classify silence vs sound with silenceRatio.
  // A single block can't be misclassified as silence due to a single sample being quiet, because the block peak is compared to the track peak.
  let trackPeak = 0;
  for (let b = 0; b < numBlocks; b++) {
    const peak = blockPeak[b]!;
    if (peak > trackPeak) trackPeak = peak;
  }

  const silenceThreshold = silenceRatio * trackPeak;
  let clips: Clip[] = [];
  let clipStartBlock = -1;
  for (let b = 0; b <= numBlocks; b++) {
    const isSound = b < numBlocks && blockPeak[b]! > silenceThreshold;
    if (isSound && clipStartBlock === -1) {
      clipStartBlock = b;
    } else if (!isSound && clipStartBlock !== -1) {
      clips.push({
        start: clipStartBlock * blockSec,
        end: b * blockSec,
        vStart: clipStartBlock * blockSec,
        vEnd: b * blockSec,
      });
      clipStartBlock = -1;
    }
  }
  clips = mergeClipsByConfig(
    clips,
    options.minClipLength,
    options.minSplitPieceSec,
  );
  expandClips(clips, audioDuration);
  const gaps = getClipGaps(clips);
  return findMinMergeGap(clips, gaps, options.minClipLength);
}

function expandClips(
  clips: Clip[],
  audioDuration: number,
  expandRatio: number = 0.25,
) {
  // Expand each clip's start and end by a fraction of the surrounding silence,
  // up to 25% of the gap on each side, but never past the clip boundaries.
  // This makes clips more natural and less abrupt.
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]!;
    const prevEnd = i > 0 ? clips[i - 1]!.end : 0;
    const nextStart =
      i < clips.length - 1 ? clips[i + 1]!.start : audioDuration;
    expandClip(clip, prevEnd, nextStart, expandRatio, audioDuration);
  }
}

export function expandClip(
  clip: Clip,
  prevEnd: number,
  nextStart: number,
  expandRatio: number,
  maxEnd: number,
): void {
  const startExpand = expandRatio * (clip.start - prevEnd);
  const endExpand = expandRatio * (nextStart - clip.end);
  clip.vStart = Math.max(0, clip.start - startExpand);
  clip.vEnd = Math.min(maxEnd, clip.end + endExpand);
  clip.expanded = true;
}

/**
 * Virtually merge consecutive clips whose intervening gap (in seconds) is at
 * most `minGap`. Each merged group becomes a parent clip spanning the first
 * child's start to the last child's end, keeping the originals as children.
 */
export function mergeClipsByGap(clips: Clip[], minGap: number): Clip[] {
  if (clips.length === 0) return [];

  const result: Clip[] = [];
  let group: Clip[] = [clips[0]!];

  const flush = () => {
    if (group.length === 1) {
      result.push(group[0]!);
    } else {
      const first = group[0]!;
      const last = group[group.length - 1]!;
      result.push({
        start: first.start,
        end: last.end,
        vStart: first.vStart,
        vEnd: last.vEnd,
        children: group,
      });
    }
    group = [];
  };

  for (let i = 1; i < clips.length; i++) {
    const next = clips[i]!;
    const gap = next.start - group[group.length - 1]!.end;
    if (gap <= minGap) {
      group.push(next);
    } else {
      flush();
      group = [next];
    }
  }
  flush();
  return result;
}

/**
 * Distinct positive gaps between consecutive clips (seconds), ascending.
 * An optional minimum can be seeded for legacy UI compatibility.
 */
export function getClipGaps(clips: Clip[]): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < clips.length; i++) {
    const gap = clips[i]!.start - clips[i - 1]!.end;
    if (Number.isFinite(gap) && gap > 0.01) gaps.push(gap);
  }
  return [...new Set(gaps)].sort((a, b) => a - b);
}

/**
 * Wrap `clips` as a single group, or return them as-is when there is only one.
 *
 * A group of one would be unsplittable, so single clips stay single clips.
 */
function asGroup(clips: Clip[]): Clip {
  const last = clips[clips.length - 1]!;

  return clips.length === 1
    ? clips[0]!
    : {
        start: clips[0]!.start,
        end: last.end,
        vStart: clips[0]!.vStart,
        vEnd: last.vEnd,
        children: clips,
      };
}

/**
 * Smallest piece a split gesture is allowed to leave behind.
 *
 * A boundary is skipped when either resulting side would still be shorter than
 * this: gaps between two sub-minimum clips, or gaps where a sub-minimum clip's
 * accumulated side of the track is itself still short. Both merge scopes honor
 * this when picking the gap to cut at.
 */
export const MIN_SPLIT_PIECE_SEC = 0.1;

/**
 * Split a merged `clip` at its largest gap between consecutive children.
 *
 * Returns exactly two pieces plus the gap they were split at, or `null` when
 * `clip` is not a merged group (or, with `minPieceSec`, when no gap is a valid
 * boundary). The gap is only reported so callers can keep the merge slider
 * pointed at the boundary that was used -- the split itself never depends on a
 * threshold.
 *
 * With `minPieceSec > 0`, a gap is skipped when either side of the cut would
 * come out shorter than the minimum:
 *   1. both bordering clips are sub-minimum,
 *   2. the left clip is sub-minimum and the accumulated piece from the first
 *      child through it is still short,
 *   3. the right clip is sub-minimum and the accumulated piece from it through
 *      the last child is still short.
 */
/**
 * Whether the gap between children `i - 1` and `i` is a viable split boundary.
 *
 * The boundary is skipped when either resulting side would be shorter than
 * `minPieceSec`:
 *   1. both bordering clips are sub-minimum,
 *   2. the left clip is sub-minimum and the accumulated piece from the first
 *      child through it is still short,
 *   3. the right clip is sub-minimum and the accumulated piece from it through
 *      the last child is still short.
 */
const isSplittableBoundary = (
  children: Clip[],
  i: number,
  minPieceSec: number,
): boolean => {
  if (minPieceSec <= 0) return true;

  const left = children[i - 1]!;
  const right = children[i]!;
  const first = children[0]!;
  const last = children[children.length - 1]!;

  const longEnough = (child: Clip) => child.end - child.start >= minPieceSec;

  const leftStranded =
    !longEnough(left) && left.end - first.start < minPieceSec;
  const rightStranded =
    !longEnough(right) && last.end - right.start < minPieceSec;

  return !(
    (!longEnough(left) && !longEnough(right)) ||
    leftStranded ||
    rightStranded
  );
};

export function splitClipAtLargestGap(
  clip: Clip,
  minPieceSec = 0,
): {pieces: Clip[]; gap: number} | null {
  // An expanded clip (its vStart/vEnd pushed out into surrounding silence
  // by `expandClip`) is treated as a single visual unit and never split.
  // Splitting it would create pieces whose visual boundaries no longer
  // match the user's mental model of what's on screen, so the gesture is
  // rejected up-front and the UI hides the split affordance for it.
  if (clip.expanded) return null;

  const children = clip.children ?? [];

  if (children.length < 2) return null;

  let splitAt = -1;
  let largestGap = -Infinity;

  for (let i = 1; i < children.length; i++) {
    if (!isSplittableBoundary(children, i, minPieceSec)) continue;

    const gap = children[i]!.start - children[i - 1]!.end;

    // Strictly greater, so equal gaps split at the earliest boundary.
    if (gap > largestGap) {
      largestGap = gap;
      splitAt = i;
    }
  }

  if (splitAt === -1) return null;

  return {
    pieces: [
      asGroup(children.slice(0, splitAt)),
      asGroup(children.slice(splitAt)),
    ],
    gap: largestGap,
  };
}

/**
 * Directional variant of `splitClipAtLargestGap`: pick the boundary closest to
 * the requested end of the group instead of the largest gap.
 *
 * "right" scans from the last gap inward, "left" from the first. Either picks
 * the smallest valid piece on that side: a short child is absorbed into its
 * neighbours until the accumulated end-piece clears `minPieceSec`, so the
 * detached part is always "longer than the minimum".
 */
export function splitClipAtEnd(
  clip: Clip,
  side: 'left' | 'right',
  minPieceSec = 0,
): {pieces: Clip[]; gap: number} | null {
  const children = clip.children ?? [];
  const count = children.length;

  if (count < 2) return null;

  let splitAt = -1;

  if (side === 'right') {
    for (let i = count - 1; i >= 1; i--) {
      if (isSplittableBoundary(children, i, minPieceSec)) {
        splitAt = i;
        break;
      }
    }
  } else {
    for (let i = 1; i < count; i++) {
      if (isSplittableBoundary(children, i, minPieceSec)) {
        splitAt = i;
        break;
      }
    }
  }

  if (splitAt === -1) return null;

  return {
    pieces: [
      asGroup(children.slice(0, splitAt)),
      asGroup(children.slice(splitAt)),
    ],
    gap: children[splitAt]!.start - children[splitAt - 1]!.end,
  };
}

/**
 * Regroup `displayClips` so it is merged by `mergeGap` only inside `focus`,
 * leaving every other clip exactly as it is.
 *
 * This is the per-clip counterpart of `mergeClipsByGap`: the gesture's gap
 * applies to the selected clip's own run of clips instead of to the whole track.
 *
 * `displayClips` is the *current* grouping, not the raw detection result, so
 * grouping established elsewhere on the track survives the gesture instead of
 * being reverted to the detector's output.
 *
 * The focused run is regrouped as currently displayed, so `mergeGap` only
 * creates merges between the run's existing groups. Already-merged groups are
 * treated as atomic units and never broken back apart. `focus` is matched by
 * containment, so passing either a displayed group or one of the clips inside
 * it selects the same region.
 *
 * Returns `displayClips` unchanged when `focus` matches nothing or holds fewer
 * than two clips.
 */
export function mergeClipsByGapScoped(
  displayClips: Clip[],
  mergeGap: number,
  focus: Clip,
): Clip[] {
  const start = displayClips.findIndex(c => c.start >= focus.start);

  let lastIdx = -1;
  for (let i = displayClips.length - 1; i >= 0; i--) {
    if (displayClips[i]!.end <= focus.end) {
      lastIdx = i;
      break;
    }
  }

  if (start === -1 || lastIdx === -1) return displayClips;

  const run = displayClips.slice(start, lastIdx + 1);

  // Nothing to regroup: the run is already a single unmerged clip.
  if (run.length < 2) return displayClips;

  const merged = mergeClipsByGap(run, mergeGap);

  return [
    ...displayClips.slice(0, start),
    ...merged,
    ...displayClips.slice(lastIdx + 1),
  ];
}

export function findMinMergeGap(
  clips: Clip[],
  gaps: number[],
  minClipLength: number,
): InitClipData {
  if (clips.length === 0) {
    return {
      minGap: 0,
      gaps,
      clips: [],
    };
  }

  // Already valid without merging.
  if (clips.every(clip => clip.end - clip.start >= minClipLength)) {
    return {
      minGap: 0,
      gaps,
      clips,
    };
  }

  let low = 0;
  let high = gaps.length - 1;

  // Fall back to the unmerged clips (and no merge) when no gap can satisfy
  // minClipLength, so a short track or a single short clip never wipes the
  // clip list.
  let result: InitClipData = {clips, minGap: 0, gaps};

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const gap = gaps[mid]!;

    const mergedClips = mergeClipsByGap(clips, gap);

    const valid = mergedClips.every(
      clip => clip.end - clip.start >= minClipLength,
    );

    if (valid) {
      // Keep this result, but continue looking
      // for a smaller gap.
      result = {
        minGap: gap,
        gaps,
        clips,
      };

      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return result;
}

/**
 * Merge short detected clips into a neighbor until every clip is either long
 * enough, or too short to be left alone.
 *
 * A clip below `minClipLength` is a candidate; `mustMergeThan` matches
 * `MIN_SPLIT_PIECE_SEC` so nothing smaller than the split rule would accept is
 * ever left on its own. A clip that only clears `mustMergeThan` stays only
 * when its nearest neighbor already cleared `minClipLength`.
 */
export function mergeClipsByConfig(
  clips: Clip[],
  minClipLength: number,
  mustMergeThan: number,
): Clip[] {
  if (clips.length <= 1) return clips;

  const result = [...clips];

  while (result.length > 1) {
    let merged = false;

    for (let i = 0; i < result.length; i++) {
      const clip = result[i]!;
      const clipLength = clip.end - clip.start;

      // Keep clips that are already long enough.
      if (clipLength >= minClipLength) {
        continue;
      }

      const left = i > 0 ? result[i - 1] : undefined;
      const right = i < result.length - 1 ? result[i + 1] : undefined;

      const leftGap = left ? clip.start - left.end : Infinity;

      const rightGap = right ? right.start - clip.end : Infinity;

      // Find the nearest adjacent clip by silence length.
      const mergeLeft = leftGap <= rightGap;
      const nearest = mergeLeft ? left! : right!;

      const nearestLength = nearest.end - nearest.start;

      // Merge when:
      // 1. The current clip is very short, or
      // 2. Its nearest neighbour is also shorter than minClipLength.
      if (clipLength > mustMergeThan && nearestLength >= minClipLength) {
        continue;
      }

      if (mergeLeft) {
        result.splice(i - 1, 2, mergeClipPair(left!, clip));
      } else {
        result.splice(i, 2, mergeClipPair(clip, right!));
      }

      // The structure changed, so restart and
      // evaluate the new merged clips again.
      merged = true;
      break;
    }

    // A complete pass without merging means
    // the result is stable.
    if (!merged) {
      break;
    }
  }

  return result;
}

/**
 * Merge two adjacent clips into one group. The two clips become the group's
 * direct children as-is, keeping their own children (and any expansion)
 * nested inside them. The result is always a merged clip with exactly these
 * two children, so it can be split again.
 */
export function mergeClipPair(left: Clip, right: Clip): Clip {
  return {
    start: left.start,
    end: right.end,
    vStart: left.vStart,
    vEnd: right.vEnd,

    children: [left, right],
  };
}
