/**
 * Adaptive energy-based clip detection. Overlapping RMS frames use a robust
 * recording reference and an estimated noise floor, with hysteresis and a
 * short onset hold to avoid transient clicks. Short pauses remain editable
 * boundaries; the average detected gap determines initial grouping.
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
  /** RMS window in milliseconds; frames overlap by at least half a window. */
  blockMs: number;
  /** Relative sensitivity, combined with an estimated recording noise floor. */
  silenceRatio: number;
  /** Minimum detected and manually split clip span in seconds, before padding. */
  minClipLength: number;
}

export interface InitClipData {
  clips: Clip[];
  gaps: number[];
  initGap: number;
}

interface AnalysisWindow {
  windowSize: number;
  hopSize: number;
}

interface SoundThresholds {
  onsetThreshold: number;
  offsetThreshold: number;
}

/** Detect sound islands, enforce the minimum, then pad and choose initial grouping. */
export function getInitClipData(
  data: Float32Array | null,
  sampleRate: number,
  options: SplitOptions,
): InitClipData {
  if (
    !data?.length ||
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isFinite(options.minClipLength) ||
    options.minClipLength < 0
  ) {
    return {clips: [], initGap: 0, gaps: []};
  }
  const duration = data.length / sampleRate;
  const window = createAnalysisWindow(sampleRate, options.blockMs);
  const rms = calculateFrameRms(data, window);
  const thresholds = estimateSoundThresholds(rms, options.silenceRatio);
  const clips = detectSoundClips(rms, window, thresholds, sampleRate, duration);
  return finalizeClips(clips, options.minClipLength, duration);
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

/** Convert the analysis window and hop from time to integer sample counts. */
function createAnalysisWindow(
  sampleRate: number,
  blockMs: number,
): AnalysisWindow {
  const windowMs = Math.max(2, Math.min(1000, finiteOr(blockMs, 20)));
  const windowSize = Math.max(1, Math.round((windowMs * sampleRate) / 1000));
  const hopSize = Math.max(
    1,
    Math.min(Math.round(sampleRate * 0.01), Math.floor(windowSize / 2)),
  );
  return {windowSize, hopSize};
}

/** Measure the energy of each overlapping frame without rescanning samples. */
function calculateFrameRms(
  data: Float32Array,
  {windowSize, hopSize}: AnalysisWindow,
): Float32Array {
  const frameCount = Math.ceil(data.length / hopSize);
  const rms = new Float32Array(frameCount);
  // Rolling energy visits each sample at most twice rather than rescanning
  // every overlapping window. Partial final windows use their actual length.
  const square = (index: number) => {
    const sample = data[index]!;
    return Number.isFinite(sample) ? sample * sample : 0;
  };
  let energy = 0;
  let previousStart = 0;
  let previousEnd = 0;
  for (let frame = 0; frame < frameCount; frame++) {
    const start = frame * hopSize;
    const end = Math.min(start + windowSize, data.length);
    for (let i = previousStart; i < start; i++) energy -= square(i);
    for (let i = previousEnd; i < end; i++) energy += square(i);
    // Floating-point subtraction can leave a tiny negative residue at silence.
    rms[frame] = Math.sqrt(Math.max(0, energy) / (end - start));
    previousStart = start;
    previousEnd = end;
  }
  return rms;
}

/** Estimate the recording's noise/signal levels and its start/stop thresholds. */
function estimateSoundThresholds(
  rms: Float32Array,
  silenceRatio: number,
): SoundThresholds {
  // These are independent tuning heuristics, not three uses of one rule.
  const amplitudeFloor = 1e-5;
  const referenceNoiseMargin = 1.5;
  const ratio = Math.max(0.0001, Math.min(0.02, finiteOr(silenceRatio, 0.01)));
  // At the default ratio (0.01), sound must clear roughly 3x the noise floor.
  const noiseThresholdMultiplier = 1.5 + ratio * 150;
  const hysteresisRatio = 1.5;
  const sorted = rms.slice().sort();
  const percentile = (q: number) =>
    sorted[Math.floor((sorted.length - 1) * q)]!;
  const noiseFloor = percentile(0.2);
  // Estimate the signal reference from frames above the noise floor, excluding
  // digital silence. This remains robust to clicks even in mostly-silent files.
  const signalStart = sorted.findIndex(
    level =>
      level > Math.max(amplitudeFloor, noiseFloor * referenceNoiseMargin),
  );
  const reference =
    signalStart >= 0
      ? sorted[
          signalStart + Math.floor((sorted.length - signalStart - 1) * 0.9)
        ]!
      : percentile(0.9);
  // The floor contribution is capped so continuous/quiet recordings are not
  // erased simply because they have no noise-only frames to estimate from.
  const onsetThreshold = Math.max(
    amplitudeFloor,
    reference * ratio,
    Math.min(noiseFloor * noiseThresholdMultiplier, reference * 0.25),
  );
  // Start requires the higher threshold; an active interval may continue
  // down to two thirds of it, retaining soft endings without rapid toggling.
  const offsetThreshold = onsetThreshold / hysteresisRatio;
  return {onsetThreshold, offsetThreshold};
}

/** Apply onset hold and hysteresis to turn frame energy into sound intervals. */
function detectSoundClips(
  rms: Float32Array,
  {windowSize, hopSize}: AnalysisWindow,
  {onsetThreshold, offsetThreshold}: SoundThresholds,
  sampleRate: number,
  duration: number,
): Clip[] {
  const frameCount = rms.length;
  // A click occupies up to one full overlapping window. Require energy for
  // longer than that footprint so increasing the window cannot admit clicks.
  const onsetFrames = Math.max(
    1,
    Math.ceil((windowSize + 0.025 * sampleRate) / hopSize),
  );
  let candidate = -1;
  let active = -1;
  const clips: Clip[] = [];
  const finish = (end: number) => {
    if (active < 0) return;
    const start = (active * hopSize) / sampleRate;
    // Frame energy includes samples after the frame's start. Keep those samples
    // in the sound boundary; playback padding is added separately below.
    const stop = Math.min(
      duration,
      ((end - 1) * hopSize + windowSize) / sampleRate,
    );
    clips.push({start, end: stop, vStart: start, vEnd: stop});
    active = -1;
  };
  for (let frame = 0; frame < frameCount; frame++) {
    const level = rms[frame]!;
    if (active >= 0) {
      if (level < offsetThreshold) finish(frame);
    } else if (level >= (candidate >= 0 ? offsetThreshold : onsetThreshold)) {
      if (candidate < 0) candidate = frame;
      // Require sustained energy before admitting an island as sound.
      if (frame - candidate + 1 >= onsetFrames) {
        active = candidate;
        candidate = -1;
      }
    } else {
      candidate = -1;
    }
  }
  finish(frameCount);
  return clips;
}

/** Enforce unpadded lengths before adding playback padding and the merge gap. */
function finalizeClips(
  clips: Clip[],
  minClipLength: number,
  duration: number,
): InitClipData {
  // Overlapping windows may touch. Coalesce those without manufacturing a gap.
  clips = mergeClipsByGap(clips, 0);
  clips = enforceMinClipLength(clips, minClipLength);
  if (!clips.length) return {clips: [], gaps: [], initGap: 0};
  expandClips(clips, duration);
  const gaps = getClipGaps(clips);
  return {
    clips,
    gaps,
    initGap: gaps.length
      ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length
      : 0,
  };
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
 * most `mergeGap`. Each merged group becomes a parent clip spanning the first
 * child's start to the last child's end, keeping the originals as children.
 */
export function mergeClipsByGap(clips: Clip[], mergeGap: number): Clip[] {
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
    if (gap <= mergeGap) {
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

/** A split is valid only when both resulting interval spans meet the minimum. */
const isSplittableBoundary = (
  children: Clip[],
  i: number,
  minPieceSec: number,
): boolean => {
  const left = children[i - 1]!;
  const right = children[i]!;
  const first = children[0]!;
  const last = children[children.length - 1]!;

  return (
    left.end - first.start + 1e-9 >= minPieceSec &&
    last.end - right.start + 1e-9 >= minPieceSec
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

/**
 * Enforce the detected interval length before playback expansion. Merge each
 * short island across its nearest gap (left wins ties), keeping other intervals
 * intact. A final isolated interval below the minimum is omitted: padding must
 * never make an otherwise invalid clip pass the minimum-length check.
 */
export function enforceMinClipLength(
  clips: Clip[],
  minClipLength: number,
): Clip[] {
  const result = [...clips];
  let index = 0;
  while (index < result.length) {
    const clip = result[index]!;
    if (clip.end - clip.start + 1e-9 >= minClipLength) {
      index++;
      continue;
    }
    if (result.length === 1) return [];
    const left = result[index - 1];
    const right = result[index + 1];
    const leftGap = left ? clip.start - left.end : Infinity;
    const rightGap = right ? right.start - clip.end : Infinity;
    if (leftGap <= rightGap + 1e-9) {
      result.splice(index - 1, 2, mergeClipPair(left!, clip));
      index--;
    } else {
      result.splice(index, 2, mergeClipPair(clip, right!));
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
