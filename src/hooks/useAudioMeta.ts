/**
 * Extracts audio metadata (channels, sample rate, bitrate).
 *
 * bitrate = (file_size_bytes * 8) / duration_seconds / 1000
 *
 * Reuses the worker decode (and its per-URL Promise cache) so metadata
 * extraction doesn't trigger a second full decode of the file. The
 * `clips` field of the decode result is ignored here — only metadata is
 * consumed; the cached `clips` are managed separately via `useClipDetection`.
 */

import {useState, useEffect, useRef} from 'react';
import {decodeAudio} from '../workers/audioDecoderClient';
import {useConfig} from './useConfig';

/**
 * Audio metadata information.
 *
 * @property channels - Number of audio channels (1 = mono, 2 = stereo)
 * @property sampleRate - Sample rate in Hz (e.g., 44100, 48000)
 * @property bitrate - Bitrate in kbps (kilobits per second)
 */
export interface AudioMeta {
  channels: number;
  sampleRate: number;
  bitrate: number;
}

export function useAudioMeta(url: string | null) {
  const [meta, setMeta] = useState<AudioMeta | null>(null);
  const urlRef = useRef(url);
  const {config} = useConfig();
  // Read the latest config via a ref so changes don't trigger a re-decode —
  // metadata never changes for a given URL, so a stale snapshot is fine.
  const configRef = useRef(config);
  useEffect(() => {
    urlRef.current = url;
    configRef.current = config;
  });

  useEffect(() => {
    const currentUrl = urlRef.current;
    if (!currentUrl) {
      setMeta(null);
      return;
    }

    // Abort the in-flight fetch when the user switches tracks mid-decode.
    // The worker's decodeAudioData call is un-interruptible, but at least
    // the network transfer stops.
    const controller = new AbortController();
    let cancelled = false;

    async function extract() {
      try {
        // Reuse the same worker decode that the waveform and playback
        // use, so the metadata never triggers a second full decode. The
        // options are passed so the per-URL cache shares a single decode
        // with `useWaveform` (which DOES use the clips field).
        const {numberOfChannels, sampleRate, byteLength, duration} =
          await decodeAudio(
            currentUrl!,
            {
              blockMs: configRef.current.blockMs,
              silenceRatio: configRef.current.silenceRatio,
              minClipLength: configRef.current.minClipLength,
            },
            controller.signal,
          );
        if (cancelled) return;

        const bitrate =
          duration > 0 ? Math.round((byteLength * 8) / duration / 1000) : 0;

        setMeta({
          channels: numberOfChannels,
          sampleRate,
          bitrate,
        });
      } catch {
        if (!cancelled) setMeta(null);
      }
    }

    extract().catch(() => {
      if (!cancelled) setMeta(null);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url]);

  return meta;
}
