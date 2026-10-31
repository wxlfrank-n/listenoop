import {describe, expect, it} from 'vitest';
import {
  getClipGaps,
  enforceMinClipLength,
  mergeClipsByGap,
  mergeClipsByGapScoped,
  getInitClipData,
  mergeClipPair,
  splitClipAtLargestGap,
  splitClipAtEnd,
  type Clip,
} from './clips';

const mk = (start: number, end: number): Clip => ({
  start,
  end,
  vStart: start,
  vEnd: end,
});

const bounds = (clips: Clip[]) => clips.map(c => [c.start, c.end]);

describe('getInitClipData — adaptive RMS', () => {
  const sampleRate = 16000;
  const opts = {
    blockMs: 20,
    silenceRatio: 0.01,
    minClipLength: 0.2,
  };
  // Alternating samples provide deterministic signal energy without randomness.
  const audio = (parts: [number, number][]) => {
    const samples: number[] = [];
    for (const [seconds, amplitude] of parts) {
      for (let i = 0; i < Math.round(seconds * sampleRate); i++) {
        samples.push(i % 2 ? amplitude : -amplitude);
      }
    }
    return new Float32Array(samples);
  };
  const detect = (parts: [number, number][], overrides = {}) =>
    getInitClipData(audio(parts), sampleRate, {...opts, ...overrides});

  it('handles empty audio, invalid sample rates, and digital silence', () => {
    for (const rate of [0, -1, NaN, Infinity]) {
      expect(getInitClipData(audio([[1, 0.1]]), rate, opts).clips).toEqual([]);
    }
    expect(getInitClipData(null, sampleRate, opts).clips).toEqual([]);
    expect(getInitClipData(new Float32Array(), sampleRate, opts).clips).toEqual(
      [],
    );
    expect(detect([[1, 0]]).clips).toEqual([]);
  });

  it('rejects invalid minimum lengths instead of silently disabling the constraint', () => {
    for (const minClipLength of [NaN, Infinity, -1]) {
      expect(detect([[0.5, 0.1]], {minClipLength})).toEqual({
        clips: [],
        gaps: [],
        initGap: 0,
      });
    }
    expect(detect([[0.5, 0.1]], {minClipLength: 0}).clips).toHaveLength(1);
  });

  it('does not let nonfinite samples poison later valid windows', () => {
    const data = audio([
      [0.3, 0],
      [0.5, 0.1],
      [0.3, 0],
    ]);
    data[100] = NaN;
    data[200] = Infinity;
    const result = getInitClipData(data, sampleRate, opts);
    expect(result.clips).toHaveLength(1);
    expect(result.clips[0]!.start).toBeCloseTo(0.3, 1);
    expect(result.clips[0]!.end).toBeCloseTo(0.8, 1);
  });

  it('retains quiet continuous audio when no noise-only region exists', () => {
    const {clips} = detect([[1, 0.001]]);
    expect(clips).toHaveLength(1);
    expect(bounds(clips)).toEqual([[0, 1]]);
    expect(clips[0]!.vStart).toBe(0);
    expect(clips[0]!.vEnd).toBe(1);
    expect(clips[0]!.expanded).toBe(true);
  });

  it('detects separated speech over a steady noise floor', () => {
    const result = detect([
      [0.5, 0.005],
      [0.5, 0.1],
      [0.5, 0.005],
      [0.5, 0.1],
      [0.5, 0.005],
    ]);
    const groups = result.clips;
    expect(groups).toHaveLength(2);
    expect(groups[0]!.start).toBeCloseTo(0.5, 1);
    expect(groups[0]!.end).toBeCloseTo(1, 1);
    expect(groups[1]!.start).toBeCloseTo(1.5, 1);
    expect(groups[1]!.end).toBeCloseTo(2, 1);
  });

  it('groups brief pauses while retaining boundaries for manual splitting', () => {
    const result = detect([
      [0.5, 0.1],
      [0.1, 0],
      [0.5, 0.1],
    ]);
    expect(result.clips).toHaveLength(2);
    const groups = mergeClipsByGap(result.clips, result.initGap);
    expect(groups).toHaveLength(1);
    expect(splitClipAtLargestGap(groups[0]!, 0.01)?.pieces).toHaveLength(2);
  });

  it('uses the arithmetic average of detected gaps for initial grouping', () => {
    const parts: [number, number][] = [[0.5, 0.1]];
    for (const pause of [0.6, 0.2, 0.5, 0.1, 0.4, 0.3]) {
      parts.push([pause, 0], [0.5, 0.1]);
    }
    const result = detect(parts);
    expect(result.gaps).toHaveLength(6);
    expect(result.initGap).toBeCloseTo(0.33, 2);
  });

  it('uses the only gap for a two-clip recording, and zero when there are no gaps', () => {
    const result = detect([
      [0.5, 0.1],
      [0.4, 0],
      [0.5, 0.1],
    ]);
    expect(result.initGap).toBe(result.gaps[0]);
    expect(detect([[0.5, 0.1]]).initGap).toBe(0);
    expect(detect([[0.5, 0]]).initGap).toBe(0);
  });

  it('a loud isolated click neither hides quiet speech nor becomes a clip', () => {
    const data = audio([
      [0.4, 0],
      [0.6, 0.001],
      [0.4, 0],
      [0.6, 0.001],
      [0.4, 0],
    ]);
    data[100] = 1;
    const {clips} = getInitClipData(data, sampleRate, opts);
    expect(clips).toHaveLength(2);
    expect(clips[0]!.start).toBeGreaterThan(0.35);
    expect(clips[1]!.start).toBeGreaterThan(1.35);
  });

  it('rejects isolated clicks at every available analysis window size', () => {
    const data = audio([
      [0.4, 0],
      [0.6, 0.001],
      [0.4, 0],
    ]);
    data[100] = 1;
    for (const blockMs of [2, 6, 12, 20, 48, 64]) {
      const {clips} = getInitClipData(data, sampleRate, {...opts, blockMs});
      expect(clips).toHaveLength(1);
      expect(clips[0]!.start).toBeGreaterThan(0.3);
    }
  });

  it('keeps quiet speech beside a click in a mostly silent recording', () => {
    const data = audio([
      [5, 0],
      [0.6, 0.001],
      [5, 0],
    ]);
    data[100] = 1;
    const {clips} = getInitClipData(data, sampleRate, opts);
    expect(clips).toHaveLength(1);
    expect(clips[0]!.start).toBeCloseTo(5, 1);
    expect(clips[0]!.end).toBeCloseTo(5.6, 1);
  });

  it('is stable when the same noisy recording is made quieter', () => {
    const parts: [number, number][] = [
      [0.4, 0.005],
      [0.5, 0.1],
      [0.4, 0.005],
      [0.5, 0.1],
      [0.4, 0.005],
    ];
    const loud = detect(parts);
    const quiet = detect(
      parts.map(([time, amplitude]) => [time, amplitude * 0.1]),
    );
    expect(bounds(quiet.clips)).toEqual(bounds(loud.clips));
  });

  it('hysteresis keeps a soft continuation attached after a louder onset', () => {
    // Zero noise floor: onset threshold is 0.01, offset threshold is ~0.0067.
    const {clips} = detect([
      [0.3, 0],
      [0.4, 1],
      [0.2, 0.008],
      [0.3, 0],
    ]);
    expect(clips).toHaveLength(1);
    expect(clips[0]!.end).toBeGreaterThanOrEqual(0.89);
  });

  it('expands by 25% of surrounding silence without fixed time caps', () => {
    const {clips} = detect([
      [3, 0],
      [0.5, 0.1],
      [4, 0],
    ]);
    const clip = clips[0]!;
    expect(clip.start - clip.vStart).toBeCloseTo(clip.start * 0.25, 5);
    expect(clip.vEnd - clip.end).toBeCloseTo((7.5 - clip.end) * 0.25, 5);
    expect(clip.vStart).toBeGreaterThanOrEqual(0);
    expect(clip.vEnd).toBeLessThanOrEqual(7.5);
    expect(clip.expanded).toBe(true);
  });

  it('expands both sides of each shared gap consistently and marks every clip expanded', () => {
    const result = detect([
      [0.3, 0],
      [0.4, 0.1],
      [0.2, 0],
      [0.5, 0.1],
      [0.4, 0],
      [0.6, 0.1],
      [0.3, 0],
    ]);
    expect(result.clips).toHaveLength(3);
    expect(result.clips.every(clip => clip.expanded)).toBe(true);
    const first = result.clips[0]!;
    const last = result.clips.at(-1)!;
    expect(first.start - first.vStart).toBeCloseTo(first.start * 0.25, 8);
    expect(last.vEnd - last.end).toBeCloseTo((2.7 - last.end) * 0.25, 8);
    for (let i = 1; i < result.clips.length; i++) {
      const left = result.clips[i - 1]!;
      const right = result.clips[i]!;
      const expansion = (right.start - left.end) * 0.25;
      expect(left.vEnd - left.end).toBeCloseTo(expansion, 8);
      expect(right.start - right.vStart).toBeCloseTo(expansion, 8);
    }
  });

  it('backtracks from a stronger onset to retain a soft lead-in above the offset threshold', () => {
    const {clips} = detect([
      [0.3, 0],
      [0.2, 0.008],
      [0.4, 1],
      [0.3, 0],
    ]);
    expect(clips).toHaveLength(1);
    expect(clips[0]!.start).toBeCloseTo(0.3, 1);
  });

  it('uses the configured expansion rate without changing sound boundaries or initial grouping', () => {
    const parts: [number, number][] = [
      [0.3, 0],
      [0.4, 0.1],
      [0.2, 0],
      [0.5, 0.1],
      [0.3, 0],
    ];
    const baseline = detect(parts);
    const expanded = detect(parts, {expansionRate: 0.4});
    expect(bounds(expanded.clips)).toEqual(bounds(baseline.clips));
    expect(expanded.initGap).toBe(baseline.initGap);
    const [left, right] = expanded.clips;
    const gap = right!.start - left!.end;
    expect(left!.vStart).toBeCloseTo(left!.start * 0.6, 8);
    expect(left!.vEnd).toBeCloseTo(left!.end + gap * 0.4, 8);
    expect(right!.vStart).toBeCloseTo(right!.start - gap * 0.4, 8);
    expect(left!.vEnd).toBeLessThan(right!.vStart);
  });

  it('clamps expansion to 0.25–0.4 and falls back to 0.25 for nonfinite values', () => {
    const parts: [number, number][] = [
      [1, 0],
      [0.5, 0.1],
      [1, 0],
    ];
    const baseline = detect(parts, {expansionRate: 0.25});
    for (const expansionRate of [0, 0.1, NaN, Infinity]) {
      expect(detect(parts, {expansionRate})).toEqual(baseline);
    }
    expect(detect(parts, {expansionRate: 0.9})).toEqual(
      detect(parts, {expansionRate: 0.4}),
    );
    expect(detect(parts, {expansionRate: 0.3}).clips[0]!.vStart).toBeLessThan(
      baseline.clips[0]!.vStart,
    );
  });

  it('never extends a partial final frame beyond the file duration', () => {
    const data = audio([
      [0.2, 0],
      [0.537, 0.1],
    ]);
    const {clips} = getInitClipData(data, sampleRate, opts);
    expect(clips).toHaveLength(1);
    expect(clips[0]!.end).toBe(data.length / sampleRate);
    expect(clips[0]!.vEnd).toBe(data.length / sampleRate);
  });

  it('produces equivalent boundaries across common sample rates', () => {
    for (const rate of [8000, 44100, 48000]) {
      const data = Float32Array.from(
        {length: Math.round(rate * 1.5)},
        (_, i) => (i >= rate * 0.5 && i < rate ? (i % 2 ? 0.1 : -0.1) : 0),
      );
      const {clips} = getInitClipData(data, rate, opts);
      expect(clips).toHaveLength(1);
      expect(clips[0]!.start).toBeCloseTo(0.5, 1);
      expect(clips[0]!.end).toBeCloseTo(1, 1);
    }
  });
});

describe('enforceMinClipLength', () => {
  it('merges a short interval with its nearest neighbor even if that neighbor is long', () => {
    const result = enforceMinClipLength(
      [mk(0, 1), mk(1.1, 1.2), mk(2, 3)],
      0.5,
    );
    expect(bounds(result)).toEqual([
      [0, 1.2],
      [2, 3],
    ]);
    expect(result.every(clip => clip.end - clip.start >= 0.5)).toBe(true);
    expect(result.every(clip => !clip.expanded)).toBe(true);
  });

  it('keeps merging short groups until every resulting span meets the minimum', () => {
    const result = enforceMinClipLength(
      [mk(0, 0.1), mk(0.12, 0.2), mk(0.22, 0.3), mk(0.32, 0.4)],
      0.35,
    );
    expect(bounds(result)).toEqual([[0, 0.4]]);
  });

  it('merges short trailing and leading intervals, and breaks ties to the left', () => {
    expect(bounds(enforceMinClipLength([mk(0, 0.1), mk(0.2, 1)], 0.3))).toEqual(
      [[0, 1]],
    );
    expect(bounds(enforceMinClipLength([mk(0, 1), mk(1.2, 1.3)], 0.3))).toEqual(
      [[0, 1.3]],
    );
    expect(
      bounds(enforceMinClipLength([mk(0, 1), mk(1.5, 1.6), mk(2.1, 3)], 0.3)),
    ).toEqual([
      [0, 1.6],
      [2.1, 3],
    ]);
  });

  it('omits an isolated short interval even if playback padding would make it long enough', () => {
    expect(
      enforceMinClipLength([{...mk(1, 1.2), vStart: 0, vEnd: 2}], 0.3),
    ).toEqual([]);
    expect(enforceMinClipLength([mk(0, 0.1), mk(0.15, 0.2)], 0.3)).toEqual([]);
    expect(enforceMinClipLength([], 0.3)).toEqual([]);
  });

  it('accepts exactly the minimum and leaves already-valid clips unchanged', () => {
    expect(
      bounds(enforceMinClipLength([mk(0, 0.3), mk(0.5, 0.8)], 0.3)),
    ).toEqual([
      [0, 0.3],
      [0.5, 0.8],
    ]);
  });
});

describe('mergeClipsByGap', () => {
  it('returns [] for an empty input', () => {
    expect(mergeClipsByGap([], 0.5)).toEqual([]);
  });

  it('returns a single clip unchanged with no children', () => {
    const clip = mk(0, 1);
    expect(mergeClipsByGap([clip], 0.5)).toEqual([clip]);
    expect(mergeClipsByGap([clip], 0.5)[0]!.children).toBeUndefined();
  });

  it('merges consecutive clips whose gap is within mergeGap into a parent', () => {
    const a = mk(0, 1);
    const b = mk(1.2, 2);
    const [parent] = mergeClipsByGap([a, b], 0.5);
    expect(parent).toEqual({
      start: 0,
      end: 2,
      vStart: 0,
      vEnd: 2,
      children: [a, b],
    });
  });

  it('merges when the gap exactly equals mergeGap', () => {
    const a = mk(0, 1);
    const b = mk(1.5, 2);
    expect(mergeClipsByGap([a, b], 0.5)).toEqual([
      {start: 0, end: 2, vStart: 0, vEnd: 2, children: [a, b]},
    ]);
  });

  it('keeps clips separate when the gap exceeds mergeGap', () => {
    const a = mk(0, 1);
    const b = mk(10, 11);
    expect(mergeClipsByGap([a, b], 0.5)).toEqual([a, b]);
  });

  it('preserves the original clip references for unmerged clips', () => {
    const a = mk(0, 1);
    const b = mk(1.2, 2);
    const c = mk(10, 11);
    const result = mergeClipsByGap([a, b, c], 0.5);
    expect(result[0]!.children).toEqual([a, b]);
    expect(result[1]).toBe(c);
  });

  it('produces a single parent spanning everything when all gaps merge', () => {
    const clips = [mk(0, 1), mk(1.1, 2), mk(2.1, 3), mk(3.2, 4)];
    expect(bounds(mergeClipsByGap(clips, 1))).toEqual([[0, 4]]);
  });

  it('groups several merged runs separated by large gaps', () => {
    const a = mk(0, 1);
    const b = mk(1.1, 2);
    const c = mk(2.1, 3);
    const d = mk(4, 5);
    const e = mk(5.1, 6);
    const result = mergeClipsByGap([a, b, c, d, e], 0.15);
    expect(bounds(result)).toEqual([
      [0, 3],
      [4, 6],
    ]);
    expect(result[0]!.children).toEqual([a, b, c]);
    expect(result[1]!.children).toEqual([d, e]);
  });

  it('keeps vStart/vEnd of the parent as the outer span of its children', () => {
    const a = mk(0, 1);
    const b = mk(1.2, 2);
    const c = mk(2.4, 3.5);
    const [parent] = mergeClipsByGap([a, b, c], 0.5);
    expect(parent!.vStart).toBe(0);
    expect(parent!.vEnd).toBe(3.5);
  });
});

describe('splitClipAtLargestGap', () => {
  it('returns null for a clip without children', () => {
    expect(splitClipAtLargestGap(mk(0, 1))).toBeNull();
  });

  it('returns null for a group with fewer than two children', () => {
    expect(
      splitClipAtLargestGap({...mk(0, 1), children: [mk(0, 1)]}),
    ).toBeNull();
  });

  it('cuts a group at its largest child gap into two pieces', () => {
    const a = mk(0, 1);
    const b = mk(2, 3);
    const c = mk(4, 5);
    const result = splitClipAtLargestGap({...mk(0, 5), children: [a, b, c]});
    expect(result?.gap).toBe(1);
    expect(result?.pieces).toHaveLength(2);
    expect(result?.pieces[0]!.children).toBeUndefined();
    expect(result?.pieces[0]).toBe(a);
    expect(result?.pieces[1]!.children).toEqual([b, c]);
  });

  it('does not tear apart a nested group: splits at its direct children', () => {
    /*
     * A detector-merged subgroup `bc` (expanded into the surrounding silence,
     * with unexpanded raw children) sits inside a larger display group. The
     * split must cut between the direct children of the display group and
     * leave `bc` intact, otherwise the pieces lose the subgroup's expansion.
     */
    const a = {...mk(0, 1), vStart: 0, vEnd: 1.2, expanded: true};
    const b = mk(1, 1.5);
    const c = mk(1.5, 2);
    const bc = {
      start: 1,
      end: 2,
      vStart: 0.9,
      vEnd: 2.1,
      expanded: true,
      children: [b, c],
    };
    const parent = {...mk(0, 2), children: [a, bc]};

    const result = splitClipAtLargestGap(parent);

    expect(result?.gap).toBe(0);
    expect(result?.pieces).toEqual([a, bc]);
    expect(result?.pieces[1]!.expanded).toBe(true);
    expect(result?.pieces[1]!.vStart).toBeCloseTo(0.9, 6);
    expect(result?.pieces[1]!.vEnd).toBeCloseTo(2.1, 6);
  });

  /*
   * Expanded clips: an `expanded` clip (its vStart/vEnd pushed out into
   * the surrounding silence by `expandClip`) is treated as a single
   * visual unit and never split. The guard at the top of
   * `splitClipAtLargestGap` short-circuits to null so the UI hides the
   * split affordance for any clip whose `expanded` flag is set, even if
   * it has multiple children that would otherwise be valid split targets.
   */
  describe('with expanded clips', () => {
    it('returns null when the clip itself is marked expanded', () => {
      // Same clip that the "cuts a group at its largest child gap" test
      // splits successfully when unexpanded — but with `expanded: true`
      // the guard fires and the function rejects the split.
      const a = mk(0, 1);
      const b = mk(2, 3);
      const c = mk(4, 5);
      const parent = {
        ...mk(0, 5),
        vStart: -0.1,
        vEnd: 5.1,
        expanded: true,
        children: [a, b, c],
      };

      expect(splitClipAtLargestGap(parent)).toBeNull();
      // The min-piece floor is irrelevant once the guard fires.
      expect(splitClipAtLargestGap(parent, 0.1)).toBeNull();
    });

    it('returns null for an expanded clip regardless of minPieceSec', () => {
      // Even with minPieceSec=0 (no floor), the expanded guard fires first.
      const a = mk(0, 1);
      const b = mk(2, 3);
      const parent = {
        ...mk(0, 3),
        vStart: 0,
        vEnd: 3.1,
        expanded: true,
        children: [a, b],
      };

      expect(splitClipAtLargestGap(parent, 0)).toBeNull();
    });

    it('still splits an unexpanded parent that has expanded children', () => {
      // The guard only fires when the clip being split is itself expanded.
      // An unexpanded parent whose children happen to be expanded leaves
      // (the normal case after `expandClips` runs on detected leaves and
      // `mergeClipPair` builds a fresh unexpanded parent around them) is
      // still split at the largest gap as usual.
      const a = {...mk(0, 1), vStart: 0, vEnd: 1.2, expanded: true};
      const b = {...mk(2, 3), vStart: 1.9, vEnd: 3.1, expanded: true};
      const parent = {
        ...mk(0, 3),
        vStart: 0, // matches a.vStart
        vEnd: 3.1, // matches b.vEnd
        // expanded intentionally NOT set on the parent
        children: [a, b],
      };

      const result = splitClipAtLargestGap(parent);

      expect(result).not.toBeNull();
      expect(result?.gap).toBe(1);
      expect(result?.pieces).toEqual([a, b]);
    });
  });
});

describe('mergeClipsByGapScoped', () => {
  // gaps: a-b 0.2, b-c 2.5, c-d 0.3
  const clips = [mk(0, 1), mk(1.2, 2), mk(4.5, 5), mk(5.3, 6)];

  it('merges only the focused clip run and leaves the rest alone', () => {
    // Focus spans a-b, so that pair is the run being regrouped.
    const focus = {start: 0, end: 2, vStart: 0, vEnd: 2};

    // c-d also sit within a 0.3 gap, but they are outside the focused run, so
    // they stay separate -- the opposite of a global merge at this gap, which
    // would join them too.
    expect(bounds(mergeClipsByGapScoped(clips, 3, focus))).toEqual([
      [0, 2],
      [4.5, 5],
      [5.3, 6],
    ]);

    // A gap too small to merge a-b leaves the list untouched.
    expect(bounds(mergeClipsByGapScoped(clips, 0.1, focus))).toEqual(
      bounds(clips),
    );
  });

  it('does not merge inside a focus that is a single raw clip', () => {
    // Focus b: its run holds one clip, so there is nothing to merge, even
    // though a global merge at this gap would join b and c across 2.5s.
    const result = mergeClipsByGapScoped(clips, 3, clips[1]!);
    expect(bounds(result)).toEqual(bounds(clips));
    expect(result[1]!.children).toBeUndefined();
  });

  it('accepts a merged parent as focus', () => {
    const [parent] = mergeClipsByGap([clips[0]!, clips[1]!], 0.5);
    expect(bounds(mergeClipsByGapScoped(clips, 0.1, parent!))).toEqual([
      [0, 1],
      [1.2, 2],
      [4.5, 5],
      [5.3, 6],
    ]);
  });

  it('returns the clips unchanged for a single-clip or unknown focus', () => {
    expect(mergeClipsByGapScoped([mk(0, 1)], 0.5, mk(0, 1))).toEqual([
      mk(0, 1),
    ]);
    expect(mergeClipsByGapScoped(clips, 0.5, mk(50, 60))).toEqual(clips);
  });
});

describe('getClipGaps', () => {
  it('returns [] for a single clip', () => {
    expect(getClipGaps([mk(0, 1)])).toEqual([]);
  });

  it('returns distinct positive gaps above 0.01, ascending', () => {
    // gaps: 0.5, 0.5, 3 -> deduped and sorted
    const clips = [mk(0, 1), mk(1.5, 2), mk(2.5, 3), mk(6, 7)];
    expect(getClipGaps(clips)).toEqual([0.5, 3]);
  });

  it('skips gaps of 0.01 or less but keeps larger ones', () => {
    // first gap is 0.005 (skipped), second gap is 1 (kept)
    const clips = [mk(0, 1), mk(1.005, 2), mk(3, 4)];
    expect(getClipGaps(clips)).toEqual([1]);
  });
});

describe('mergeClipPair', () => {
  it('nests the two merged clips as direct children', () => {
    const a = mk(0, 1);
    const b = mk(2, 3);
    const group = {...mk(0, 3), children: [a, b]};
    const c = mk(4, 5);

    const merged = mergeClipPair(group, c);

    expect(merged.children).toEqual([group, c]);
  });

  it('keeps an expanded nested group intact instead of flattening it', () => {
    /*
     * A subgroup expanded into the surrounding silence must survive the merge
     * unflattened (same object reference), otherwise its expansion (vStart/
     * vEnd) is lost. Nesting keeps the whole parent as one child, so nothing
     * is torn apart at all.
     */
    const a = {...mk(0, 1), vStart: 0, vEnd: 1.2, expanded: true};
    const b = mk(1, 1.5);
    const c = mk(1.5, 2);
    const bc = {
      start: 1,
      end: 2,
      vStart: 0.9,
      vEnd: 2.1,
      expanded: true,
      children: [b, c],
    };
    const parent = {...mk(0, 2), children: [a, bc]};
    const d = mk(3, 4);

    const merged = mergeClipPair(parent, d);

    expect(merged.children).toEqual([parent, d]);
    expect(merged.children![0]).toBe(parent);
    expect(merged.children![0]!.children![1]!.vEnd).toBeCloseTo(2.1, 6);
  });

  it('keeps a single expanded leaf whole', () => {
    const a = {...mk(0, 1), vStart: 0, vEnd: 1.2, expanded: true};
    const b = {...mk(2, 3), vStart: 1.9, vEnd: 3.1, expanded: true};

    const merged = mergeClipPair(a, b);

    expect(merged.start).toBe(0);
    expect(merged.end).toBe(3);
    expect(merged.vStart).toBe(0);
    expect(merged.vEnd).toBe(3.1);
    expect(merged.children).toEqual([a, b]);
  });
});

describe('configured split minimum', () => {
  const group = (children: Clip[]): Clip => ({
    ...mk(children[0]!.start, children.at(-1)!.end),
    children,
  });

  it('rejects a split that would strand a clip below the supplied minimum', () => {
    const clip = group([mk(0, 0.2), mk(0.5, 1)]);
    for (const minimum of [0.3, 0.5, 0.7]) {
      expect(splitClipAtLargestGap(clip, minimum)).toBeNull();
      expect(splitClipAtEnd(clip, 'left', minimum)).toBeNull();
      expect(splitClipAtEnd(clip, 'right', minimum)).toBeNull();
    }
  });

  it('allows pieces of exactly 0.3 seconds without counting playback padding', () => {
    const clip = group([mk(0, 0.3), mk(0.5, 0.8)]);
    expect(splitClipAtLargestGap(clip, 0.3)?.pieces).toHaveLength(2);
    expect(splitClipAtEnd(clip, 'left', 0.3)?.pieces).toHaveLength(2);
    const short = group([{...mk(0, 0.2), vStart: 0, vEnd: 0.4}, mk(0.5, 1)]);
    expect(splitClipAtLargestGap(short, 0.3)).toBeNull();
  });

  it('skips a larger invalid gap and finds a split with two long enough pieces', () => {
    const clip = group([mk(0, 0.2), mk(1, 1.4), mk(1.6, 2)]);
    for (const result of [
      splitClipAtLargestGap(clip, 0.3),
      splitClipAtEnd(clip, 'left', 0.3),
      splitClipAtEnd(clip, 'right', 0.3),
    ]) {
      expect(result?.pieces).toHaveLength(2);
      expect(
        result?.pieces.every(piece => piece.end - piece.start >= 0.3),
      ).toBe(true);
    }
  });

  it('merges short detected islands instead of returning new sub-0.3s clips', () => {
    const rate = 16000;
    const data = Float32Array.from({length: rate * 2}, (_, i) =>
      (i >= rate * 0.2 && i < rate * 0.3) || (i >= rate && i < rate * 1.5)
        ? i % 2
          ? 0.1
          : -0.1
        : 0,
    );
    const result = getInitClipData(data, rate, {
      blockMs: 20,
      silenceRatio: 0.01,
      minClipLength: 0.3,
    });
    expect(result.clips).toHaveLength(1);
    expect(result.clips.every(clip => clip.end - clip.start >= 0.3)).toBe(true);
  });
});

describe('shared minimum clip length', () => {
  it('enforces a chosen minimum above 0.3 before expansion', () => {
    const rate = 16000;
    const data = Float32Array.from({length: rate * 3}, (_, i) =>
      (i >= rate * 0.3 && i < rate * 0.7) ||
      (i >= rate && i < rate * 1.4) ||
      (i >= rate * 2 && i < rate * 2.8)
        ? i % 2
          ? 0.1
          : -0.1
        : 0,
    );
    const result = getInitClipData(data, rate, {
      blockMs: 20,
      silenceRatio: 0.01,
      minClipLength: 0.7,
    });
    expect(result.clips).toHaveLength(2);
    expect(result.clips.every(clip => clip.end - clip.start >= 0.7)).toBe(true);
    const group = {...mk(0, 1.4), children: [mk(0, 0.4), mk(0.6, 1.4)]};
    expect(splitClipAtLargestGap(group, 0.7)).toBeNull();
    expect(splitClipAtEnd(group, 'right', 0.7)).toBeNull();
  });

  it('omits a lone short fragment rather than using surrounding silence to meet the minimum', () => {
    const rate = 16000;
    const data = Float32Array.from({length: rate * 3}, (_, i) =>
      i >= rate && i < rate * 1.1 ? (i % 2 ? 0.1 : -0.1) : 0,
    );
    expect(
      getInitClipData(data, rate, {
        blockMs: 20,
        silenceRatio: 0.01,
        minClipLength: 0.3,
      }),
    ).toEqual({clips: [], gaps: [], initGap: 0});
  });
});

it('uses options.minClipLength without imposing a separate 0.3-second floor', () => {
  const rate = 16000;
  const data = Float32Array.from({length: rate}, (_, i) =>
    i >= rate * 0.3 && i < rate * 0.45 ? (i % 2 ? 0.1 : -0.1) : 0,
  );
  const options = {blockMs: 20, silenceRatio: 0.01, minClipLength: 0.1};
  expect(getInitClipData(data, rate, options).clips).toHaveLength(1);
  expect(
    getInitClipData(data, rate, {...options, minClipLength: 0.3}).clips,
  ).toHaveLength(0);
  const children = [mk(0, 0.15), mk(0.3, 0.5)];
  const group = {...mk(0, 0.5), children};
  expect(splitClipAtLargestGap(group, 0.1)?.pieces).toHaveLength(2);
  expect(splitClipAtLargestGap(group, 0.3)).toBeNull();
});
