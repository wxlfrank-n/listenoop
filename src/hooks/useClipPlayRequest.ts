/**
 * Plays the clip named by a parent's `ClipPlayRequest`.
 *
 * A split or merge changes which clip should be playing, and the parent owns
 * that decision. It describes it as data rather than reaching into a view
 * through a handle, and each waveform view reacts here because it is the only
 * place that can arm its own playback context.
 *
 * Requests carry a `nonce` so re-rendering with the same request is a no-op
 * while a genuinely new request (even for the same clip) replays.
 *
 * View-switch safety: when the user flips between the stacked and
 * single-row waveform views, the previously-mounted view unmounts and a
 * fresh one mounts with whatever `clipPlayRequest` was last issued still
 * in the parent's state. A fresh view's `handledNonceRef` starts at 0, so
 * without a guard it would treat that stale request as new and call
 * `playRange` again — restarting the current clip even though the user
 * only changed the view. To prevent that, the FIRST effect run on mount
 * treats any pre-existing `clipPlayRequest` as already handled (the
 * previous view already played it; the audio element keeps playing
 * uninterrupted because it lives in `useAudioPlayer`, not in the view).
 * Only requests that arrive AFTER mount trigger `playRange`.
 */

import {useEffect, useRef} from 'react';

import type {ClipPlayRequest} from '../types';

export function useClipPlayRequest(
  clipPlayRequest: ClipPlayRequest | undefined,
  playRange: (start: number, end: number, repetitions: number) => void,
): void {
  const handledNonceRef = useRef(0);
  // Tracks whether the effect has run at least once for this view
  // instance. The first run corresponds to the view's mount; subsequent
  // runs correspond to genuine `clipPlayRequest` / `playRange` changes.
  const isFirstEffectRef = useRef(true);

  useEffect(() => {
    // On mount / view switch: if a `clipPlayRequest` was already pending
    // (issued before the view mounted), treat it as handled so we don't
    // replay the current clip just because the user flipped the view.
    // The audio element itself is owned by `useAudioPlayer`, so playback
    // continues uninterrupted if it was already playing, and nothing
    // starts if it wasn't — which is exactly the intended behaviour for
    // a view change.
    if (isFirstEffectRef.current) {
      isFirstEffectRef.current = false;
      if (clipPlayRequest) {
        handledNonceRef.current = clipPlayRequest.nonce;
      }
      return;
    }

    if (!clipPlayRequest) return;

    if (handledNonceRef.current === clipPlayRequest.nonce) return;

    handledNonceRef.current = clipPlayRequest.nonce;

    playRange(
      clipPlayRequest.clip.vStart,
      clipPlayRequest.clip.vEnd,
      clipPlayRequest.repetitions,
    );
  }, [clipPlayRequest, playRange]);
}
