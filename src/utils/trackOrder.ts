import type {Track} from '../types';

export function sortedTrackIndices(tracks: Track[]): number[] {
  return tracks
    .map((_, index) => index)
    .sort((a, b) =>
      tracks[a].title.localeCompare(tracks[b].title, undefined, {
        sensitivity: 'base',
      }),
    );
}

export function adjacentTrackIndex(
  tracks: Track[],
  current: number,
  offset: -1 | 1,
): number {
  const order = sortedTrackIndices(tracks);
  if (!order.length) return -1;
  const position = order.indexOf(current);
  if (position < 0) return offset === 1 ? order[0] : order[order.length - 1];
  return order[(position + offset + order.length) % order.length];
}
