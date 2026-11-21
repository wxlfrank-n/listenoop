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
  /** Unpadded bounds of the original long clip before valley splitting. */
  longClipSource?: {start: number; end: number};
}
/** User-supplied silence-split parameters (config-driven). */
export interface SplitOptions {
  /** RMS window in milliseconds; frames overlap by at least half a window. */
  blockMs: number;
  /** Relative sensitivity, combined with an estimated recording noise floor. */
  silenceRatio: number;
  /** Minimum detected and manually split clip span in seconds, before padding. */
  minClipLength: number;
  /** Fraction of surrounding silence included in playback (0.25–0.4), capped at half minClipLength per side. */
  expansionRate?: number;
  /** Only clips longer than this many seconds are considered for valley splitting. Default: 1. */
  longClipThreshold?: number;
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
  const expansionRate = Math.max(
    0.25,
    Math.min(0.4, finiteOr(options.expansionRate, 0.25)),
  );
  return finalizeClips(
    clips,
    options.minClipLength,
    duration,
    expansionRate,
    rms,
    window.hopSize / sampleRate,
    finiteOr(options.longClipThreshold, 1),
  );
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
    while (active > 0 && rms[active - 1]! >= offsetThreshold) active--;
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
/** Smooth log RMS over a 15 ms radius for the second-pass valley search. */
function smoothLogEnergy(rms: Float32Array, hopSeconds: number): Float32Array {
  const db = new Float32Array(rms.length);
  for (let i = 0; i < rms.length; i++)
    db[i] = 20 * Math.log10(Math.max(rms[i]!, 1e-8));
  const radius = Math.max(1, Math.round(0.015 / hopSeconds));
  const prefix = new Float64Array(db.length + 1);
  for (let i = 0; i < db.length; i++) prefix[i + 1] = prefix[i]! + db[i]!;
  const smooth = new Float32Array(db.length);
  for (let i = 0; i < db.length; i++) {
    const from = Math.max(0, i - radius);
    const to = Math.min(db.length, i + radius + 1);
    smooth[i] = (prefix[to]! - prefix[from]!) / (to - from);
  }
  return smooth;
}

interface FallbackValley {
  first: number;
  last: number;
  level: number;
}

interface LongClipAnalysis {
  db: Float32Array;
  startFrame: number;
  hopSeconds: number;
  fallbackValleys?: FallbackValley[];
}

/** Recheck long pieces after every successful split. */
function splitLongClipsAtValleys(
  clips: Clip[],
  rms: Float32Array,
  hopSeconds: number,
  minClipLength: number,
  longClipThreshold: number,
): Clip[] {
  if (
    !Number.isFinite(longClipThreshold) ||
    longClipThreshold <= 0 ||
    !Number.isFinite(hopSeconds) ||
    hopSeconds <= 0 ||
    !rms.length
  )
    return clips;
  const minimum = Math.max(0, minClipLength);
  return clips.flatMap(clip => {
    const duration = clip.end - clip.start;
    if (duration <= longClipThreshold) return [clip];
    const longClipSource = {start: clip.start, end: clip.end};
    if (duration < 2 * minimum) return [{...clip, longClipSource}];
    const startFrame = Math.ceil(clip.start / hopSeconds - 1e-9);
    const endFrame = Math.ceil(clip.end / hopSeconds - 1e-9);
    const analysis: LongClipAnalysis = {
      db: smoothLogEnergy(rms.subarray(startFrame, endFrame), hopSeconds),
      startFrame,
      hopSeconds,
    };
    const pending = [clip];
    const result: Clip[] = [];
    while (pending.length) {
      const piece = pending.pop()!;
      const length = piece.end - piece.start;
      if (length > longClipThreshold && length >= 2 * minimum) {
        const splits = splitClipAtValleys(piece, analysis, minimum);
        if (splits.length > 1) {
          for (let i = splits.length - 1; i >= 0; i--) {
            pending.push(splits[i]!);
          }
          continue;
        }
      }
      result.push({...piece, longClipSource});
    }
    return result;
  });
}

/** Select split boundaries from this piece's view of the original envelope. */
function splitClipAtValleys(
  clip: Clip,
  analysis: LongClipAnalysis,
  minimum: number,
): Clip[] {
  const {startFrame, hopSeconds} = analysis;
  // A previous split can place the start halfway between RMS frames.
  const from = Math.ceil(clip.start / hopSeconds - 1e-9) - startFrame;
  const to = Math.min(
    analysis.db.length,
    Math.ceil(clip.end / hopSeconds - 1e-9) - startFrame,
  );
  const db = analysis.db.subarray(from, to);
  let topDb = -Infinity;
  let bottomDb = Infinity;
  for (const level of db) {
    topDb = Math.max(topDb, level);
    bottomDb = Math.min(bottomDb, level);
  }
  const rangeDb = topDb - bottomDb;
  const entryLevel = topDb - Math.max(rangeDb * 0.8, 3);
  const exitLevel = topDb - rangeDb * 0.7;
  const valleys = detectValleyBottoms(db, entryLevel, exitLevel, hopSeconds);
  const timeAtFrame = (frame: number) => (startFrame + frame) * hopSeconds;
  const valleyTimes = valleys
    .map(({firstFrame, lastFrame}) =>
      timeAtFrame(from + (firstFrame + lastFrame) / 2),
    )
    .filter(time => canSplitAt(time, clip.start, clip.end, minimum));
  const splitTimes = valleyTimes.length
    ? valleyTimes
    : findFallbackSplitTimes(analysis, clip, from, to, timeAtFrame, minimum);
  const result: Clip[] = [];
  let start = clip.start;
  for (const time of splitTimes) {
    if (canSplitAt(time, start, clip.end, minimum)) {
      result.push({start, end: time, vStart: start, vEnd: time});
      start = time;
    }
  }
  if (!result.length) return [clip];
  result.push({start, end: clip.end, vStart: start, vEnd: clip.end});
  return result;
}

function canSplitAt(time: number, start: number, end: number, minimum: number) {
  return (
    time > start &&
    time < end &&
    time - start + 1e-9 >= minimum &&
    end - time + 1e-9 >= minimum
  );
}

/** Find and rank local minima once for the original long clip. */
function findFallbackValleys(db: Float32Array): FallbackValley[] {
  const candidates: FallbackValley[] = [];
  for (let first = 1; first < db.length - 1; first++) {
    const level = db[first]!;
    if (level >= db[first - 1]!) continue;
    let last = first;
    while (db[last + 1] === level) last++;
    if (last < db.length - 1 && level < db[last + 1]!) {
      candidates.push({first, last, level});
    }
    first = last;
  }

  return candidates.sort((a, b) => a.level - b.level || a.first - b.first);
}

function findFallbackSplitTimes(
  analysis: LongClipAnalysis,
  clip: Clip,
  from: number,
  to: number,
  timeAtFrame: (frame: number) => number,
  minimum: number,
): number[] {
  const candidates = (analysis.fallbackValleys ??= findFallbackValleys(
    analysis.db,
  ));
  const duration = clip.end - clip.start;
  const limit = duration < 2 ? 1 : duration < 3 ? 2 : 3;
  const selected: number[] = [];
  for (const {first, last} of candidates) {
    if (first <= from || last >= to - 1) continue;
    const time = timeAtFrame((first + last) / 2);
    if (!canSplitAt(time, clip.start, clip.end, minimum)) continue;
    if (selected.every(other => Math.abs(time - other) + 1e-9 >= minimum)) {
      selected.push(time);
      if (selected.length === limit) break;
    }
  }
  return selected.sort((a, b) => a - b);
}

/** Detect sustained low-energy spans bracketed by higher-energy frames. */
function detectValleyBottoms(
  db: Float32Array,
  onsetThreshold: number,
  offsetThreshold: number,
  hopSeconds: number,
): {firstFrame: number; lastFrame: number}[] {
  const frameCount = db.length;
  const onsetFrames = Math.max(1, Math.ceil(0.02 / hopSeconds));
  let candidate = -1;
  let active = -1;
  const valleys: {firstFrame: number; lastFrame: number}[] = [];
  const finish = (end: number) => {
    valleys.push({firstFrame: active, lastFrame: end - 1});
    active = -1;
  };
  // An interior valley must be preceded by energy above the offset threshold.
  let firstHighFrame = 0;
  while (firstHighFrame < frameCount && db[firstHighFrame]! <= offsetThreshold)
    firstHighFrame++;
  for (let frame = firstHighFrame; frame < frameCount; frame++) {
    const level = db[frame]!;
    if (active >= 0) {
      if (level > offsetThreshold) finish(frame);
    } else if (level <= (candidate >= 0 ? offsetThreshold : onsetThreshold)) {
      if (candidate < 0) {
        candidate = frame;
        // Measure both edges at the offset threshold after qualifying the dip.
        while (
          candidate > firstHighFrame &&
          db[candidate - 1]! <= offsetThreshold
        )
          candidate--;
      }
      if (frame - candidate + 1 >= onsetFrames) {
        active = candidate;
        candidate = -1;
      }
    } else {
      candidate = -1;
    }
  }
  return valleys;
}

/** Enforce unpadded lengths before adding playback padding and the merge gap. */
function finalizeClips(
  clips: Clip[],
  minClipLength: number,
  duration: number,
  expansionRate: number,
  rms: Float32Array,
  hopSeconds: number,
  longClipThreshold: number,
): InitClipData {
  // Overlapping windows may touch. Coalesce those without manufacturing a gap.
  clips = mergeClipsByGap(clips, 0, {keepChildren: false});
  clips = splitLongClipsAtValleys(
    clips,
    rms,
    hopSeconds,
    minClipLength,
    longClipThreshold,
  );
  clips = enforceMinClipLength(clips, minClipLength);
  if (!clips.length) return {clips: [], gaps: [], initGap: 0};
  expandClips(clips, duration, expansionRate, minClipLength / 2);
  const gaps = getClipGaps(clips);
  if (gaps.length > 0 && gaps[0] === 0) gaps[0] = -0.000001; // Avoid zero merge gap, which would prevent any merging.
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
  expansionRate: number,
  maxExpansion: number,
) {
  if (clips.length === 0) return;
  let prev = clips[0]!;
  prev.vStart = prev.start - Math.min(maxExpansion, expansionRate * prev.start);
  for (let i = 1; i < clips.length; i++) {
    const next = clips[i]!;
    const expansion = Math.min(
      maxExpansion,
      (next.start - prev.end) * expansionRate,
    );
    prev.vEnd = prev.end + expansion;
    next.vStart = next.start - expansion;
    prev = next;
  }
  prev.vEnd =
    prev.end +
    Math.min(maxExpansion, expansionRate * (audioDuration - prev.end));
}

/**
 * Virtually merge consecutive clips whose intervening gap (in seconds) is at
 * most `mergeGap`. Each merged group becomes a parent clip spanning the first
 * child's start to the last child's end. By default it keeps the originals as children.
 * Initial grouping can preserve automatic valley splits within one source.
 */
export function mergeClipsByGap(
  clips: Clip[],
  mergeGap: number,
  {preserveValleySplits = false, keepChildren = true} = {},
): Clip[] {
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
        ...(keepChildren ? {children: group} : {}),
      });
    }
    group = [];
  };
  for (let i = 1; i < clips.length; i++) {
    const next = clips[i]!;
    const previous = group[group.length - 1]!;
    const gap = next.start - previous.end;
    const source = previous.longClipSource;
    const keepBoundary =
      preserveValleySplits &&
      gap === 0 &&
      source !== undefined &&
      source.start === next.longClipSource?.start &&
      source.end === next.longClipSource.end;
    if (gap <= mergeGap && !keepBoundary) {
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
    if (Number.isFinite(gap)) gaps.push(gap);
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
/** List the midpoints and child indices of gaps that can split this clip. */
export function getClipSplitBoundaries(clip: Clip, minPieceSec = 0) {
  const boundaries: {time: number; index: number}[] = [];
  const children = clip.children ?? [];
  for (let i = 1; i < children.length; i++) {
    if (isSplittableBoundary(children, i, minPieceSec)) {
      boundaries.push({
        time: (children[i - 1]!.end + children[i]!.start) / 2,
        index: i,
      });
    }
  }
  return boundaries;
}

/** Pick the valid gap whose midpoint is nearest to the requested time. */
export function splitClipAtPosition(
  clip: Clip,
  target: number,
  minPieceSec = 0,
): {pieces: [Clip, Clip]; gap: number} | null {
  const children = clip.children ?? [];
  let splitAt = -1;
  let nearestDistance = Infinity;
  for (const {time, index} of getClipSplitBoundaries(clip, minPieceSec)) {
    const distance = Math.abs(time - target);
    // Stable across platforms: ties within floating-point tolerance go left.
    if (distance < nearestDistance - 1e-9) {
      nearestDistance = distance;
      splitAt = index;
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

/** Split nearest to the halfway point. */
export function splitClipAtMiddle(clip: Clip, minPieceSec = 0) {
  return splitClipAtPosition(clip, (clip.start + clip.end) / 2, minPieceSec);
}

/** Left/right-angle swipe: split nearest to one-third/two-thirds, respectively. */
export function splitClipAtThird(
  clip: Clip,
  side: 'left' | 'right',
  minPieceSec = 0,
) {
  return splitClipAtPosition(
    clip,
    clip.start + (clip.end - clip.start) * (side === 'left' ? 1 / 3 : 2 / 3),
    minPieceSec,
  );
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
      result.splice(
        index - 1,
        2,
        mergeClipPair(left!, clip, {keepChildren: false}),
      );
      index--;
    } else {
      result.splice(
        index,
        2,
        mergeClipPair(clip, right!, {keepChildren: false}),
      );
    }
  }
  return result;
}
/**
 * Merge two adjacent clips into one group. The two clips become the group's
 * direct children as-is, keeping their own children (and any expansion)
 * nested inside them by default so the pair can be split again.
 */
export function mergeClipPair(
  left: Clip,
  right: Clip,
  {keepChildren = true} = {},
): Clip {
  return {
    start: left.start,
    end: right.end,
    vStart: left.vStart,
    vEnd: right.vEnd,
    ...(keepChildren ? {children: [left, right]} : {}),
  };
}
