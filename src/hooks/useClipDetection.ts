/**
 * Re-runs clip detection against the cached mono samples in the worker
 * whenever the user changes detection settings.
 *
 * The decode flow (`useWaveform`) computes the FIRST set of clips for a
 * URL using whatever config was current when the URL changed, then
 * publishes them to Redux alongside the waveform. This hook is the
 * follow-up: when the user fiddles with `blockMs`, `silenceRatio`,
 * `minClipLength`, or `minSplitPieceSec` (and the URL has finished
 * decoding), it asks the worker to re-run `getInitClipData` against the
 * cached mono with the new options and publishes the updated clips.
 *
 * The worker's mono cache means this is cheap (~10–50 ms for a typical
 * track) and does NOT re-fetch or re-decode the file. The clip-detection
 * loop that previously froze the UI on the main thread now runs off the
 * main thread entirely.
 *
 * No-op while `waveformStatus !== 'ready'`: the worker has no cached mono
 * to operate on yet.
 */

import {useEffect} from 'react';
import {redetectClips} from '../workers/audioDecoderClient';
import {useAppDispatch, useAppSelector} from '../store/hooks';
import {setClips} from '../store/analysisSlice';
import type {SplitOptions} from '../utils/clips';

export function useClipDetection(
  url: string | null,
  options: SplitOptions,
): void {
  const dispatch = useAppDispatch();
  const status = useAppSelector(s => s.analysis.waveformStatus);

  useEffect(() => {
    if (!url) {
      dispatch(setClips({clips: [], gaps: [], minGap: 0}));
      return;
    }
    // The worker has no cached mono to operate on until the decode finishes.
    if (status !== 'ready') return;

    let cancelled = false;

    redetectClips(url, options)
      .then(clips => {
        if (cancelled) return;
        dispatch(setClips(clips));
      })
      .catch(() => {
        // Redetect failed (e.g. worker doesn't have the mono cached, or
        // the worker crashed). The initial clips from the decode are
        // still in Redux, so the UI keeps showing those.
      });

    return () => {
      cancelled = true;
    };
    // Options is a fresh object every render; spread its scalar fields
    // into deps so the effect fires when any of them changes.
  }, [
    url,
    options.blockMs,
    options.silenceRatio,
    options.minClipLength,
    options.minSplitPieceSec,
    status,
    dispatch,
  ]);
}
