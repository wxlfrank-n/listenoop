export const LOOP_MODES = ['off', 'track', 'playlist', 'shuffle'] as const;
export type LoopMode = (typeof LOOP_MODES)[number];

export function restoreLoopMode(
  value: unknown,
  legacyLoopPlaylist?: unknown,
): LoopMode {
  return LOOP_MODES.includes(value as LoopMode)
    ? (value as LoopMode)
    : legacyLoopPlaylist === true
      ? 'playlist'
      : 'off';
}

/** Only natural track endings use this policy; manual navigation stays explicit. */
export function nextLoopTrackIndex(
  order: number[],
  current: number,
  mode: LoopMode,
  random = Math.random,
): number | null {
  if (mode === 'off' || !order.length) return null;
  if (mode === 'track') return order.includes(current) ? current : order[0]!;
  if (mode === 'playlist')
    return order[(order.indexOf(current) + 1) % order.length]!;
  const candidates = order.filter(index => index !== current);
  if (!candidates.length) return order[0]!;
  const choice = Math.min(
    candidates.length - 1,
    Math.max(0, Math.floor(random() * candidates.length)),
  );
  return candidates[choice]!;
}
