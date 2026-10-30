/**
 * Keyboard seek handler for waveform views.
 *
 * Returns a React `onKeyDown` handler that turns the waveform container
 * (which must have `tabIndex={0}` to be focusable) into a focusable,
 * arrow-key-navigable "slider"-style region. This is the keyboard
 * equivalent of clicking on the waveform to seek.
 *
 * Keys:
 *   ArrowLeft / ArrowRight         — small step (1 s)
 *   Shift + ArrowLeft / ArrowRight  — large step (`skipSeconds` from config)
 *   PageDown / PageUp              — large step (`skipSeconds`)
 *   Home                           — jump to start (0 s)
 *   End                            — jump to end (`duration`)
 *
 * The handler is a no-op when `duration` is 0 or NaN (track not loaded yet).
 *
 * Usage:
 *   const onKeyDown = useWaveformKeyboard({
 *     duration: waveform.duration,
 *     getCurrentTime,
 *     onSeek,
 *     skipSeconds: config.skipSeconds,
 *   });
 *   return (
 *     <div
 *       role="slider"
 *       tabIndex={0}
 *       aria-label={t('waveform.ariaLabel')}
 *       aria-valuemin={0}
 *       aria-valuemax={Math.max(0, duration)}
 *       aria-valuenow={currentTime}
 *       onKeyDown={onKeyDown}
 *     >
 *       ...
 *     </div>
 *   );
 */

import {useCallback} from 'react';

const SMALL_STEP_SEC = 1;

export interface WaveformKeyboardOptions {
  duration: number;
  /** Live playhead position (no React re-render required). */
  getCurrentTime: () => number;
  /** Seek to the given time. */
  onSeek: (time: number) => void;
  /** Large step (config.skipSeconds, typically 10 s). */
  skipSeconds: number;
  /** Optional: clamps to [0, duration]. Defaults to true. */
  clamp?: boolean;
}

export function useWaveformKeyboard({
  duration,
  getCurrentTime,
  onSeek,
  skipSeconds,
  clamp = true,
}: WaveformKeyboardOptions) {
  return useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      // Track not loaded yet: let the event bubble (e.g. so the page can
      // scroll if the waveform container is the focused element).
      if (!Number.isFinite(duration) || duration <= 0) return;

      const step = e.shiftKey ? skipSeconds : SMALL_STEP_SEC;
      const target = e.target as HTMLElement;
      // Only intercept when the container itself (or a non-interactive
      // descendant) has focus. If a clip button or a tab is focused, the
      // arrow keys should drive that element instead.
      const isInteractive = target.closest(
        'button, a, [role="button"], input, [role="tab"]',
      );
      if (isInteractive) return;

      let next: number | null = null;

      switch (e.key) {
        case 'ArrowLeft':
          next = getCurrentTime() - step;
          break;
        case 'ArrowRight':
          next = getCurrentTime() + step;
          break;
        case 'PageUp':
          // PageUp = forward by convention here (matches the player's
          // forward-skip button direction).
          next = getCurrentTime() + skipSeconds;
          break;
        case 'PageDown':
          next = getCurrentTime() - skipSeconds;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = duration;
          break;
        default:
          return;
      }

      if (next === null) return;

      e.preventDefault();

      if (clamp) {
        next = Math.max(0, Math.min(duration, next));
      }

      onSeek(next);
    },
    [duration, getCurrentTime, onSeek, skipSeconds, clamp],
  );
}
