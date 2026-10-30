import {describe, expect, it} from 'vitest';
import {mergeClipsByGap, type Clip} from './clips';
import {mergeClips, mergeClipRange, splitClip, splitClipEnd} from './swipe';

const mk = (start: number, end: number): Clip => ({
  start,
  end,
  vStart: start,
  vEnd: end,
});

const bounds = (clips: Clip[]) => clips.map(c => [c.start, c.end]);

describe('splitClip', () => {
  it('returns null for clips without children', () => {
    const clips = [mk(0, 1)];
    expect(splitClip(clips, clips, 0)).toBeNull();
  });

  it('splits any group with at least two children by its largest gap', () => {
    const clip: Clip = {
      start: 0,
      end: 3,
      vStart: 0,
      vEnd: 3,
      children: [mk(0, 0.5), mk(0.8, 1.3), mk(2, 2.5)],
    };
    // largest child gap (0.7) sets the merge level just below itself
    const result = splitClip([clip], [clip], 0, 'global');
    expect(result?.mergeGap).toBeCloseTo(0.699999);
    expect(result?.activeClip).toBe(0);
  });

  it('sets the merge gap just below the largest child gap', () => {
    const clips = [mk(0, 1), mk(1.2, 2), mk(2.5, 3), mk(5, 6)];
    const displayClips = mergeClipsByGap(clips, 0.6);

    const result = splitClip(clips, displayClips, 0, 'global');

    expect(result?.mergeGap).toBeCloseTo(0.499999);
    expect(result?.activeClip).toBe(0);
    expect(mergeClipsByGap(clips, result!.mergeGap)[0]!.children).toEqual([
      clips[0],
      clips[1],
    ]);
  });

  it('returns null when splitting an unmerged clip', () => {
    const clips = [mk(0, 1), mk(2, 3)];
    const displayClips = mergeClipsByGap(clips, 0.1);

    expect(splitClip(clips, displayClips, 0)).toBeNull();
  });

  it('keeps activeClip on the split group when earlier groups also break up', () => {
    /*
     * At mergeGap 0.2 the display list is:
     *   0: {c0,c1,c2}   1: {c3}   2: {c4}   3: {c5,c6}
     *
     * Splitting group 3 drops the gap just below its 0.1s child gap, which
     * also breaks group 0 apart. Every later group shifts right, so the
     * first piece of the split group ends up at index 5 -- not the old
     * index 3.
     */
    const clips = [
      mk(0, 1),
      mk(1.1, 2),
      mk(2.15, 3),
      mk(3.3, 4),
      mk(6, 7),
      mk(7.5, 8.5),
      mk(8.6, 9.6),
    ];
    const displayClips = mergeClipsByGap(clips, 0.2);
    const splitIdx = 3;

    expect(displayClips).toHaveLength(4);
    expect(displayClips[splitIdx]!.children).toEqual([clips[5], clips[6]]);

    const result = splitClip(clips, displayClips, splitIdx, 'global');

    expect(result?.mergeGap).toBeCloseTo(0.099999, 6);

    const nextClips = mergeClipsByGap(clips, result!.mergeGap);

    // The boundary gap is no longer merged, so all seven clips stand alone.
    expect(nextClips).toHaveLength(7);

    // activeClip must follow the first piece of the group that was split:
    // the first clip starting at or after the pre-split clip's start.
    expect(result!.activeClip).toBe(5);
    expect(nextClips[result!.activeClip]!.start).toBe(
      displayClips[splitIdx]!.start,
    );
    expect(nextClips[result!.activeClip]).toBe(clips[5]);

    /*
     * The active clip is strictly shorter than the group it came from, so
     * playback must read its bounds from the new list -- reusing the
     * pre-split clip would replay past the split point.
     */
    expect(nextClips[result!.activeClip]!.vEnd).toBeCloseTo(8.5, 6);
    expect(displayClips[splitIdx]!.vEnd).toBeCloseTo(9.6, 6);
  });

  it('cuts at one boundary only, leaving earlier groups alone', () => {
    /*
     * Three raw clips merged into one group by 1s gaps. All three gaps are
     * equal, so the largest one is the first: a-b | c-d. Clip scope performs
     * that single cut rather than re-thresholding the group, which would have
     * broken up every 1s boundary at once.
     */
    const clips = [mk(0, 1), mk(2, 3), mk(4, 5)];
    const displayClips = mergeClipsByGap(clips, 1);
    expect(displayClips).toHaveLength(1);

    const result = splitClip(clips, displayClips, 0, 'clip')!;

    expect(bounds(result.clips!)).toEqual([
      [0, 1],
      [2, 5],
    ]);
    expect(result.clips![1]!.children).toEqual([clips[1], clips[2]]);
    expect(result.activeClip).toBe(0);
  });

  it('keeps unrelated groups intact when splitting in clip scope', () => {
    /*
     * Regression: the scoped split used to regroup from the raw detection
     * result, which reverted grouping the user had already established
     * elsewhere on the track. Splitting the c-d group must leave the a-b and
     * e-f groups merged.
     */
    const clips = [
      mk(0, 1),
      mk(1.15, 2),
      mk(6, 7),
      mk(7.15, 8),
      mk(12, 13),
      mk(13.15, 14),
    ];
    // a-b, c-d and e-f are 0.15 apart (inside the 0.2 threshold) while ~4.85
    // silences keep the three pairs apart.
    const displayClips = mergeClipsByGap(clips, 0.2);
    expect(bounds(displayClips)).toEqual([
      [0, 2],
      [6, 8],
      [12, 14],
    ]);

    const result = splitClip(clips, displayClips, 1, 'clip')!;

    // c-d splits back apart; a-b and e-f stay merged.
    expect(bounds(result.clips!)).toEqual([
      [0, 2],
      [6, 7],
      [7.15, 8],
      [12, 14],
    ]);
    expect(result.clips![0]!.children).toEqual([clips[0], clips[1]]);
    expect(result.clips![3]!.children).toEqual([clips[4], clips[5]]);
    expect(result.activeClip).toBe(1);
  });

  it('skips a gap between two sub-0.1s pieces in clip scope', () => {
    /*
     * Rule 1: a gap whose two bordering clips are each shorter than
     * MIN_SPLIT_PIECE_SEC is not a candidate, even when the accumulated pieces
     * on both sides would be long enough. So the 3.44 silence between the two
     * 0.01s clips is ignored and the split lands on the next largest gap.
     */
    const clip: Clip = {
      start: 0,
      end: 7,
      vStart: 0,
      vEnd: 7,
      children: [mk(0, 1), mk(1.05, 1.06), mk(4.5, 4.51), mk(6, 7)],
    };

    const result = splitClip([clip], [clip], 0, 'clip')!;

    expect(bounds(result.clips!)).toEqual([
      [0, 4.51],
      [6, 7],
    ]);
    expect(result.activeClip).toBe(0);
  });

  it('skips a gap stranding a leading sub-0.1s piece in clip scope', () => {
    /*
     * Rule 2: the gap right after the 0.05s leading clip is not a candidate --
     * the accumulated piece from the first child to that clip is still only
     * 0.05s. The split falls back to the gap at the other end.
     */
    const clip: Clip = {
      start: 0,
      end: 4,
      vStart: 0,
      vEnd: 4,
      children: [mk(0, 0.05), mk(1, 2), mk(3, 4)],
    };

    const result = splitClip([clip], [clip], 0, 'clip')!;

    expect(bounds(result.clips!)).toEqual([
      [0, 2],
      [3, 4],
    ]);
    expect(result.activeClip).toBe(0);
  });

  it('skips a gap stranding a trailing sub-0.1s piece in clip scope', () => {
    /*
     * Rule 3: the gap just before the 0.01s trailing clip is not a candidate --
     * the accumulated piece from that clip to the last child is still only
     * 0.01s. The split falls back to the gap at the other end.
     */
    const clip: Clip = {
      start: 0,
      end: 4,
      vStart: 0,
      vEnd: 4,
      children: [mk(0, 1), mk(2, 3), mk(3.02, 3.03)],
    };

    const result = splitClip([clip], [clip], 0, 'clip')!;

    expect(bounds(result.clips!)).toEqual([
      [0, 1],
      [2, 3.03],
    ]);
    expect(result.activeClip).toBe(0);
  });

  it('allows a piece of exactly MIN_SPLIT_PIECE_SEC in clip scope', () => {
    // 0.1s is not *less than* the minimum, so both surrounding gaps stay valid.
    const clip: Clip = {
      start: 0,
      end: 4,
      vStart: 0,
      vEnd: 4,
      children: [mk(0, 1), mk(1.15, 1.25), mk(3, 4)],
    };

    const result = splitClip([clip], [clip], 0, 'clip')!;

    expect(bounds(result.clips!)).toEqual([
      [0, 1.25],
      [3, 4],
    ]);
  });

  it('returns null when the only gap strands a sub-0.1s piece', () => {
    // The single gap leaves the 0.05s leading clip alone, so no boundary works.
    const clip: Clip = {
      start: 0,
      end: 3,
      vStart: 0,
      vEnd: 3,
      children: [mk(0, 0.05), mk(2, 3)],
    };

    expect(splitClip([clip], [clip], 0, 'clip')).toBeNull();
  });

  it('applies the 0.1s piece rule to the global merge gap too', () => {
    /*
     * The 0.01s middle clip does not strand a piece -- the accumulated piece
     * to its left is 1.06s -- so the largest gap is still a valid boundary and
     * the merge level sits just below it.
     */
    const clip: Clip = {
      start: 0,
      end: 5.5,
      vStart: 0,
      vEnd: 5.5,
      children: [mk(0, 1), mk(1.05, 1.06), mk(5, 5.5)],
    };

    const result = splitClip([clip], [clip], 0, 'global')!;

    expect(result.mergeGap).toBeCloseTo(3.939999, 6);
  });

  it('skips a stranding gap when setting the global merge gap', () => {
    /*
     * The largest gap (5.95) sits next to the 0.05s leading clip and would
     * leave it alone on one side, so global scope must not set the merge level
     * just below it. It falls to the gap that keeps both sides at least
     * MIN_SPLIT_PIECE_SEC.
     */
    const clip: Clip = {
      start: 0,
      end: 8,
      vStart: 0,
      vEnd: 8,
      children: [mk(0, 0.05), mk(6, 6.5), mk(7, 8)], // 5.95 silence > 0.5
    };

    const result = splitClip([clip], [clip], 0, 'global')!;

    expect(result.mergeGap).toBeCloseTo(0.499999, 6);
  });
});

describe('splitClipEnd', () => {
  it('returns null for clips without children', () => {
    const clips = [mk(0, 1)];
    expect(splitClipEnd(clips, clips, 0, 'right')).toBeNull();
    expect(splitClipEnd(clips, clips, 0, 'left')).toBeNull();
  });

  it('detaches the rightmost child in clip scope', () => {
    const clip: Clip = {
      start: 0,
      end: 5,
      vStart: 0,
      vEnd: 5,
      children: [mk(0, 1), mk(2, 3), mk(4, 5)],
    };

    const result = splitClipEnd([clip], [clip], 0, 'right', 'clip')!;

    expect(bounds(result.clips!)).toEqual([
      [0, 3],
      [4, 5],
    ]);
    expect(result.clips![0]!.children).toEqual([
      clip.children![0],
      clip.children![1],
    ]);
    expect(result.clips![1]).toEqual(clip.children![2]);
    expect(result.activeClip).toBe(0);
    // The silence the rightmost part was cut at.
    expect(result.mergeGap).toBeCloseTo(1);
  });

  it('detaches the leftmost child in clip scope', () => {
    const clip: Clip = {
      start: 0,
      end: 5,
      vStart: 0,
      vEnd: 5,
      children: [mk(0, 1), mk(2, 3), mk(4, 5)],
    };

    const result = splitClipEnd([clip], [clip], 0, 'left', 'clip')!;

    expect(bounds(result.clips!)).toEqual([
      [0, 1],
      [2, 5],
    ]);
    expect(result.clips![0]).toEqual(clip.children![0]);
    expect(result.clips![1]!.children).toEqual([
      clip.children![1],
      clip.children![2],
    ]);
    expect(result.activeClip).toBe(0);
  });

  it('right side absorbs a sub-minimum trailing child into the detached part', () => {
    /*
     * The last child (0.01s) cannot stand alone, so the rightmost valid
     * boundary moves in and detaches it together with the child before it.
     */
    const clip: Clip = {
      start: 0,
      end: 5,
      vStart: 0,
      vEnd: 5,
      children: [mk(0, 1), mk(2, 3), mk(3.02, 3.03)],
    };

    const result = splitClipEnd([clip], [clip], 0, 'right', 'clip')!;

    expect(bounds(result.clips!)).toEqual([
      [0, 1],
      [2, 3.03],
    ]);
    expect(result.clips![1]!.children).toEqual([
      clip.children![1],
      clip.children![2],
    ]);
  });

  it('left side absorbs a sub-minimum leading child into the detached part', () => {
    const clip: Clip = {
      start: 0,
      end: 5,
      vStart: 0,
      vEnd: 5,
      children: [mk(0, 0.03), mk(0.07, 1), mk(2, 3), mk(4, 5)],
    };

    const result = splitClipEnd([clip], [clip], 0, 'left', 'clip')!;

    // The 0.03s leading clip strands alone, so the boundary moves onward.
    expect(bounds(result.clips!)).toEqual([
      [0, 1],
      [2, 5],
    ]);
    expect(result.clips![0]!.children).toEqual([
      clip.children![0],
      clip.children![1],
    ]);
  });

  it('right side cuts at its own end gap, not the largest one', () => {
    /*
     * All three gaps are valid, but the rightmost boundary wins over the
     * largest silence at the other end of the group.
     */
    const clip: Clip = {
      start: 0,
      end: 5.5,
      vStart: 0,
      vEnd: 5.5,
      children: [mk(0, 1), mk(3, 4), mk(4.05, 5), mk(5.1, 5.5)],
    };

    const result = splitClipEnd([clip], [clip], 0, 'right', 'clip')!;

    expect(bounds(result.clips!)).toEqual([
      [0, 5],
      [5.1, 5.5],
    ]);
    expect(result.mergeGap).toBeCloseTo(0.1);
  });

  it('left side cuts at its own leading gap', () => {
    const clip: Clip = {
      start: 0,
      end: 5.5,
      vStart: 0,
      vEnd: 5.5,
      children: [mk(0, 1), mk(1.05, 2), mk(3, 4), mk(4.5, 5.5)],
    };

    const result = splitClipEnd([clip], [clip], 0, 'left', 'clip')!;

    expect(bounds(result.clips!)).toEqual([
      [0, 1],
      [1.05, 5.5],
    ]);
  });

  it('leaves unrelated groups intact when splitting in clip scope', () => {
    const clips = [
      mk(0, 1),
      mk(1.15, 2),
      mk(6, 7),
      mk(7.15, 8),
      mk(12, 13),
      mk(13.15, 14),
    ];
    const displayClips = mergeClipsByGap(clips, 0.2);

    const result = splitClipEnd(clips, displayClips, 1, 'right', 'clip')!;

    // c-d peels its rightmost child off; a-b and e-f stay merged.
    expect(bounds(result.clips!)).toEqual([
      [0, 2],
      [6, 7],
      [7.15, 8],
      [12, 14],
    ]);
    expect(result.clips![0]!.children).toEqual([clips[0], clips[1]]);
    expect(result.clips![3]!.children).toEqual([clips[4], clips[5]]);
    expect(result.activeClip).toBe(1);
  });

  it('sets the global merge gap just below the detached end gap', () => {
    const clips = [mk(0, 1), mk(1.2, 2), mk(2.5, 3), mk(5, 6)];
    const displayClips = mergeClipsByGap(clips, 0.6);

    const result = splitClipEnd(clips, displayClips, 0, 'right', 'global')!;

    /*
     * The group {c0,c1,c2} is split at its trailing gap (0.5), so the whole
     * track re-thresholds just below it: c1-c2 no longer fuses, a-b still does.
     */
    expect(result.mergeGap).toBeCloseTo(0.499999);
    expect(bounds(mergeClipsByGap(clips, result.mergeGap))).toEqual([
      [0, 2],
      [2.5, 3],
      [5, 6],
    ]);
    expect(result.activeClip).toBe(0);
  });

  it('returns null when the chosen end holds no valid boundary', () => {
    const clip: Clip = {
      start: 0,
      end: 3,
      vStart: 0,
      vEnd: 3,
      children: [mk(0, 0.05), mk(2, 3)],
    };

    // The single gap strands the 0.05s leading clip on both sides.
    expect(splitClipEnd([clip], [clip], 0, 'right', 'clip')).toBeNull();
    expect(splitClipEnd([clip], [clip], 0, 'left', 'clip')).toBeNull();
  });
});

describe('mergeClips', () => {
  it('merges only the clip and tracks its nearest silence', () => {
    const clips = [mk(0, 1), mk(1.2, 2), mk(2.5, 3), mk(5, 6)];
    const displayClips = mergeClipsByGap(clips, 0.1); // all four separate

    const result = mergeClips(clips, displayClips, 1, 'global');

    // nearest gap for idx 1 is the previous (0.2 vs 0.5)
    expect(result?.clips).toHaveLength(3);
    expect(result?.clips[0]!.children).toEqual([clips[0], clips[1]]);
    expect(result?.clips[2]).toEqual(clips[3]);
    expect(result?.activeClip).toBe(0);
    expect(result?.mergeGap).toBeCloseTo(0.2);
    expect(result?.clips[0]!.start).toBe(0);
    expect(result?.clips[0]!.end).toBe(2);
  });

  it('merges toward the nearest neighbor when the next gap is smaller', () => {
    const clips = [mk(0, 1), mk(1.2, 2), mk(2.5, 3), mk(5, 6)];
    const displayClips = mergeClipsByGap(clips, 0.1);

    const result = mergeClips(clips, displayClips, 0, 'global');

    expect(result?.clips[0]!.children).toEqual([clips[0], clips[1]]);
    expect(result?.activeClip).toBe(0);
    expect(result?.mergeGap).toBeCloseTo(0.2);
  });

  it('merges an already-merged group with its nearest group', () => {
    const clips = [mk(0, 1), mk(1.2, 2), mk(2.5, 3), mk(5, 6)];
    const displayClips = mergeClipsByGap(clips, 0.1);

    const first = mergeClips(clips, displayClips, 1, 'global')!;
    const second = mergeClips(clips, first.clips, first.activeClip, 'global')!;

    expect(second.clips).toHaveLength(2);
    expect(second.clips[0]!.children).toEqual([clips[0], clips[1], clips[2]]);
    expect(second.activeClip).toBe(0);
    expect(second.mergeGap).toBeCloseTo(0.5);
  });

  it('leaves other groups untouched in clip scope', () => {
    // a-b gap 0.2, b-c gap 2, c-d gap 0.3.
    const clips = [mk(0, 1), mk(1.2, 2), mk(4, 5), mk(5.3, 6)];
    const displayClips = mergeClipsByGap(clips, 0.1); // all four separate

    // Gesture on c: nearest neighbor is d (0.3 vs 2 to b), so the gap is 0.3.
    // Global scope at 0.3 also swallows a-b (0.2), which is outside the gesture.
    const global = mergeClips(clips, displayClips, 2, 'global');
    expect(bounds(global!.clips)).toEqual([
      [0, 2],
      [4, 6],
    ]);

    // Clip scope merges only c-d and leaves a-b alone.
    const scoped = mergeClips(clips, displayClips, 2, 'clip');
    expect(bounds(scoped!.clips)).toEqual([
      [0, 1],
      [1.2, 2],
      [4, 6],
    ]);
    expect(scoped!.activeClip).toBe(2);
    expect(scoped!.mergeGap).toBeCloseTo(0.3);
  });

  it('keeps grouping established elsewhere when merging in clip scope', () => {
    /*
     * Regression: scoped operations used to regroup from the raw detection
     * result, which reverted grouping established by an earlier clip-scope
     * gesture on a different part of the track.
     */
    const clips = [mk(0, 1), mk(1.2, 2), mk(4, 5), mk(5.3, 6), mk(8, 9)];
    const separate = mergeClipsByGap(clips, 0.1);

    // First clip-scope merge: a-b (0.2 gap).
    const first = mergeClips(clips, separate, 1, 'clip')!;
    expect(bounds(first.clips)).toEqual([
      [0, 2],
      [4, 5],
      [5.3, 6],
      [8, 9],
    ]);

    // Second clip-scope merge on c-d must leave the a-b group intact.
    const second = mergeClips(clips, first.clips, 2, 'clip')!;
    expect(bounds(second.clips)).toEqual([
      [0, 2],
      [4, 6],
      [8, 9],
    ]);
    expect(second.clips[0]!.children).toEqual([clips[0], clips[1]]);
  });

  it('merges exactly one pair regardless of the merge gap', () => {
    /*
     * The three gaps are 0.4 / 0.6 / 0.5. Clip scope picks the nearest pair
     * (0.4) and merges only those two, so exactly one boundary disappears and
     * the third gap plays no part.
     */
    const clips = [mk(0, 1), mk(1.4, 2), mk(2.6, 3), mk(4.1, 5)];
    const displayClips = mergeClipsByGap(clips, 0.1);

    const result = mergeClips(clips, displayClips, 1, 'clip')!;

    expect(bounds(result.clips!)).toEqual([
      [0, 2],
      [2.6, 3],
      [4.1, 5],
    ]);
    expect(result.clips[0]!.children).toEqual([clips[0], clips[1]]);
    expect(result.activeClip).toBe(0);
  });

  it('returns null when merging the only displayed clip', () => {
    const clips = [mk(0, 1)];
    const displayClips = mergeClipsByGap(clips, 0.1);

    expect(mergeClips(clips, displayClips, 0)).toBeNull();
  });
});

describe('mergeClipRange', () => {
  it('fuses the whole range into one group in clip scope', () => {
    const clips = [mk(0, 1), mk(1.2, 2), mk(2.5, 3), mk(4, 5), mk(8, 9)];
    const displayClips = mergeClipsByGap(clips, 0.1);

    const result = mergeClipRange(clips, displayClips, 1, 3, 'clip')!;

    expect(bounds(result.clips!)).toEqual([
      [0, 1],
      [1.2, 5],
      [8, 9],
    ]);
    expect(result.clips![1]!.children).toEqual([
      expect.objectContaining({
        start: 1.2,
        end: 3,
        children: [displayClips[1], displayClips[2]],
      }),
      displayClips[3],
    ]);
    expect(result.activeClip).toBe(1);
    // Largest silence inside 1..3: 1.2s-2s end 2 .. 2.5 start gap 0.5? 0.5 vs 1? bounded below by... the 3 gaps: 0.2, 0.5, 1 → max 1.
    expect(result.mergeGap).toBeCloseTo(1);
  });

  it('returns null for a degenerate range', () => {
    const clips = [mk(0, 1), mk(2, 3)];
    const displayClips = mergeClipsByGap(clips, 0.1);

    expect(mergeClipRange(clips, displayClips, 0, 0)).toBeNull();
  });

  it('regroups the whole track in global scope at the largest range gap', () => {
    /*
     * Gaps: 0.2 (a-b), 0.5 (b-c), 1 (c-d), 3 (d-e). Pinching c and e sets the
     * threshold to the largest in-range gap (3), fusing every boundary up to
     * and including it, so the whole track becomes one group.
     */
    const clips = [mk(0, 1), mk(1.2, 2), mk(2.5, 3), mk(4, 5), mk(8, 9)];
    const displayClips = mergeClipsByGap(clips, 0.1);

    const result = mergeClipRange(clips, displayClips, 2, 4, 'global');

    expect(result?.mergeGap).toBeCloseTo(3);
    expect(bounds(result!.clips!)).toEqual([[0, 9]]);
    expect(result!.activeClip).toBe(0);
  });

  it('keeps earlier groups intact when the range fuse does not reach them', () => {
    const clips = [mk(0, 1), mk(5, 6), mk(7, 8), mk(9, 10), mk(14, 15)];
    const displayClips = mergeClipsByGap(clips, 0.1);

    const result = mergeClipRange(clips, displayClips, 1, 3, 'clip')!;

    expect(bounds(result.clips!)).toEqual([
      [0, 1],
      [5, 10],
      [14, 15],
    ]);
    expect(result.activeClip).toBe(1);
  });

  it('fuses exactly the right neighbor regardless of the gap on the other side', () => {
    /*
     * The down-right swipe must pick the RIGHT clip even when the LEFT gap is
     * smaller: the range (1, 2) is forced, not nearest-neighbor.
     */
    const clips = [mk(0, 1), mk(1.2, 2), mk(4, 5), mk(10, 12)];
    const displayClips = mergeClipsByGap(clips, 0.1);

    const result = mergeClipRange(clips, displayClips, 1, 2, 'clip')!;

    expect(bounds(result.clips!)).toEqual([
      [0, 1],
      [1.2, 5],
      [10, 12],
    ]);
    expect(result.clips![1]!.children).toEqual([
      displayClips[1],
      displayClips[2],
    ]);
    expect(result.activeClip).toBe(1);
  });

  it('fuses exactly the left neighbor regardless of the gap on the other side', () => {
    /*
     * The range (0, 1) fuses a with b although the gap to c on the right (0.3)
     * is the smaller one -- the range is forced, not nearest-neighbor.
     */
    const clips = [mk(0, 1), mk(1.5, 2), mk(2.3, 3), mk(10, 12)];
    const displayClips = mergeClipsByGap(clips, 0.1);

    const result = mergeClipRange(clips, displayClips, 0, 1, 'clip')!;

    expect(bounds(result.clips!)).toEqual([
      [0, 2],
      [2.3, 3],
      [10, 12],
    ]);
    expect(result.clips![0]!.children).toEqual([
      displayClips[0],
      displayClips[1],
    ]);
    expect(result.activeClip).toBe(0);
  });
});

describe('ClipSplitResult.pieces', () => {
  it('exposes the two split pieces for the split animation', () => {
    const clip: Clip = {
      start: 0,
      end: 3,
      vStart: 0,
      vEnd: 3,
      children: [mk(0, 0.5), mk(0.8, 1.3), mk(2, 2.5)],
    };

    const result = splitClip([clip], [clip], 0, 'clip')!;

    // largest child gap (0.7) cuts between the last two children
    expect(bounds(result.pieces)).toEqual([
      [0, 1.3],
      [2, 2.5],
    ]);
  });

  it('detaches the leftmost piece while the remainder keeps its own range', () => {
    const clip: Clip = {
      start: 0,
      end: 3,
      vStart: 0,
      vEnd: 3,
      children: [mk(0, 0.5), mk(0.8, 1.3), mk(2, 2.5)],
    };

    const result = splitClipEnd([clip], [clip], 0, 'left', 'clip')!;

    expect(bounds(result.pieces)).toEqual([
      [0, 0.5],
      [0.8, 2.5],
    ]);
  });

  it('exposes the pieces in global scope too', () => {
    const clips = [mk(0, 0.5), mk(0.8, 1.3), mk(2, 2.5)];
    const displayClips = mergeClipsByGap(clips, 0.9);

    const result = splitClip(clips, displayClips, 0, 'global')!;

    expect(bounds(result.pieces)).toEqual([
      [0, 1.3],
      [2, 2.5],
    ]);
  });
});
