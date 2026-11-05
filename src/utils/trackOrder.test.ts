import {describe, expect, it} from 'vitest';
import {adjacentTrackIndex, sortedTrackIndices} from './trackOrder';

const tracks = ['Zulu', 'alpha', 'Beta'].map((title, index) => ({
  id: String(index),
  title,
  artist: '',
  duration: 10,
  url: title,
}));

describe('sorted playlist navigation', () => {
  it('uses title order without changing the stored track indices', () => {
    expect(sortedTrackIndices(tracks)).toEqual([1, 2, 0]);
    expect(adjacentTrackIndex(tracks, 1, 1)).toBe(2);
    expect(adjacentTrackIndex(tracks, 2, -1)).toBe(1);
    expect(tracks[0]?.title).toBe('Zulu');
  });
  it('wraps at both ends in display order', () => {
    expect(adjacentTrackIndex(tracks, 0, 1)).toBe(1);
    expect(adjacentTrackIndex(tracks, 1, -1)).toBe(0);
  });
  it('handles empty and unselected playlists', () => {
    expect(adjacentTrackIndex([], -1, 1)).toBe(-1);
    expect(adjacentTrackIndex(tracks, -1, 1)).toBe(1);
    expect(adjacentTrackIndex(tracks, -1, -1)).toBe(0);
  });
});
