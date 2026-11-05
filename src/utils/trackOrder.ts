import type {Track} from '../types';

export function sortedTrackIndices(tracks: Track[]): number[] {
  return tracks
    .map((track, index) => ({track, index}))
    .sort((a, b) =>
      a.track.title.localeCompare(b.track.title, undefined, {
        sensitivity: 'base',
      }),
    )
    .map(({index}) => index);
}

export function adjacentTrackIndex(
  tracks: Track[],
  current: number,
  offset: -1 | 1,
): number {
  const order = sortedTrackIndices(tracks);
  if (!order.length) return -1;
  const position = order.indexOf(current);
  // `order` is non-empty here, so every access below is in range.
  if (position < 0) return offset === 1 ? order[0]! : order[order.length - 1]!;
  return order[(position + offset + order.length) % order.length]!;
}
