import {describe, expect, it} from 'vitest';
import {nextLoopTrackIndex, restoreLoopMode, LOOP_MODES} from './loopMode';

describe('loop modes', () => {
  const order = [2, 0, 1];
  it('stops, repeats the current track, or advances and wraps in tracklist order', () => {
    expect(nextLoopTrackIndex(order, 0, 'off')).toBeNull();
    expect(nextLoopTrackIndex(order, 0, 'track')).toBe(0);
    expect(nextLoopTrackIndex(order, 0, 'playlist')).toBe(1);
    expect(nextLoopTrackIndex(order, 1, 'playlist')).toBe(2);
    expect(nextLoopTrackIndex(order, 0, 'clips')).toBe(1);
    expect(nextLoopTrackIndex(order, 1, 'clips')).toBe(2);
  });
  it('randomly chooses another track, including both ends of the choice range', () => {
    expect(nextLoopTrackIndex(order, 0, 'shuffle', () => 0)).toBe(2);
    expect(nextLoopTrackIndex(order, 0, 'shuffle', () => 0.9999)).toBe(1);
    for (const value of [0, 0.2, 0.5, 0.8, 0.9999]) {
      expect(nextLoopTrackIndex(order, 0, 'shuffle', () => value)).not.toBe(0);
    }
  });
  it('handles empty and single-track lists and a missing selection', () => {
    for (const mode of LOOP_MODES)
      expect(nextLoopTrackIndex([], -1, mode)).toBeNull();
    for (const mode of ['track', 'playlist', 'shuffle', 'clips'] as const) {
      expect(nextLoopTrackIndex([7], 7, mode)).toBe(7);
      expect(nextLoopTrackIndex(order, -1, mode, () => 0)).toBe(2);
    }
  });
  it('migrates the old toggle and preserves valid new preferences', () => {
    expect(restoreLoopMode(undefined, true)).toBe('playlist');
    expect(restoreLoopMode(undefined, false)).toBe('off');
    expect(restoreLoopMode('bad')).toBe('off');
    for (const mode of LOOP_MODES)
      expect(restoreLoopMode(mode, true)).toBe(mode);
  });
});
