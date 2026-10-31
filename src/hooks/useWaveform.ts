/**
 * Decodes audio and stores waveform data + initial clips in Redux.
 *
 * The decoded mono samples live in the `analysis` slice so all components can
 * read them; this hook owns the decode side effect and reports status.
 *
 * The heavy lifting (fetch + decodeAudioData + mono downmix + WAV encode +
 * initial clip detection) happens in `audioDecoder.worker.ts` via
 * `decodeAudio()` in the client module, so the main thread stays
 * responsive while a long track decodes.
 *
 * Subsequent re-detection (when the user changes detection settings) is
 * handled by `useClipDetection` — this hook only fires when the URL
 * changes, and reads the latest config via a ref so option changes don't
 * re-trigger a full decode.
 */

import {useEffect, useRef} from 'react';
import {decodeAudio} from '../workers/audioDecoderClient';
import {useAppDispatch, useAppSelector} from '../store/hooks';
import {setWaveform, setWaveformStatus, setClips} from '../store/analysisSlice';
import {useConfig} from './useConfig';
import type {WaveformData, WaveformStatus} from '../types';

export type {WaveformData, WaveformStatus} from '../types';

export function useWaveform(url: string | null): {
  data: WaveformData | null;
  status: WaveformStatus;
} {
  const dispatch = useAppDispatch();
  const waveform = useAppSelector(s => s.analysis.waveform);
  const status = useAppSelector(s => s.analysis.waveformStatus);
  const {config} = useConfig();
  const urlRef = useRef(url);
  // Snapshot the latest config into a ref so the decode effect doesn't
  // re-fire on every config change — only the URL matters. The initial
  // decode uses whatever config is current when the URL changes; option
  // changes after that are picked up by `useClipDetection`.
  const configRef = useRef(config);

  useEffect(() => {
    urlRef.current = url;
    configRef.current = config;
  });

  // Decode audio and keep raw mono samples when url changes
  useEffect(() => {
    const currentUrl = urlRef.current;
    if (!currentUrl) {
      dispatch(setWaveform(null));
      dispatch(setWaveformStatus('idle'));
      dispatch(setClips({clips: [], gaps: [], initGap: 0}));
      return;
    }
    dispatch(setWaveformStatus('loading'));
    // Clear the previous track's clips so the UI doesn't briefly show
    // them overlaid on the loading waveform.
    dispatch(setClips({clips: [], gaps: [], initGap: 0}));

    // Abort the in-flight fetch when the user switches tracks mid-decode so
    // we don't keep downloading a long MP3 we no longer need. The worker's
    // `decodeAudioData` call is un-interruptible, but at least the network
    // transfer stops and the cache evicts the failed entry.
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      try {
        const result = await decodeAudio(
          currentUrl!,
          {
            blockMs: configRef.current.blockMs,
            silenceRatio: configRef.current.silenceRatio,
            minClipLength: configRef.current.minClipLength,
          },
          controller.signal,
        );
        if (cancelled) return;
        dispatch(
          setWaveform({
            data: result.mono,
            sampleRate: result.sampleRate,
            duration: result.duration,
          }),
        );
        // Worker computed initial clips with the config snapshot above;
        // publish them so the UI shows something immediately. If the user
        // has since changed detection settings, `useClipDetection` will
        // overwrite these via `redetectClips`.
        dispatch(setClips(result.clips));
        dispatch(setWaveformStatus('ready'));
      } catch {
        if (cancelled) return;
        dispatch(setWaveform(null));
        dispatch(setClips({clips: [], gaps: [], initGap: 0}));
        dispatch(setWaveformStatus('error'));
      }
    }

    load().catch(() => {
      if (cancelled) return;
      dispatch(setWaveform(null));
      dispatch(setClips({clips: [], gaps: [], initGap: 0}));
      dispatch(setWaveformStatus('error'));
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, dispatch]);

  return {data: status === 'ready' ? waveform : null, status};
}
