const STORAGE_KEY = 'listenoop-playback-resume';

interface PlaybackPosition {
  playlist: string;
  trackId: string;
  time: number;
}

export function loadPlaybackPosition(
  playlist: string,
): PlaybackPosition | undefined {
  try {
    const saved: Partial<PlaybackPosition> | null = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    );
    if (
      saved?.playlist === playlist &&
      typeof saved.trackId === 'string' &&
      typeof saved.time === 'number' &&
      Number.isFinite(saved.time) &&
      saved.time >= 0
    ) {
      return {playlist, trackId: saved.trackId, time: saved.time};
    }
  } catch {
    // Playback still works when storage is unavailable or invalid.
  }
}

export function savePlaybackPosition(
  playlist: string,
  trackId: string | undefined,
  time: number,
) {
  try {
    if (trackId === undefined) localStorage.removeItem(STORAGE_KEY);
    else if (Number.isFinite(time) && time >= 0) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({playlist, trackId, time}),
      );
    }
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}
