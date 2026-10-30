/**
 * Web Worker that performs the heavy audio-processing pipeline off the
 * main thread:
 *
 *   fetch(url) → decodeAudioData → mono downmix → WAV encode → clip detection
 *
 * Returns the WAV-encoded audio (as a transferable ArrayBuffer), the mono
 * downmix (as a transferable Float32Array), the metadata the UI needs
 * (sample rate, duration, channel count, file byte length), and the
 * result of clip detection for the supplied SplitOptions.
 *
 * The mono downmix + WAV encode loops are the truly expensive operations:
 * for a 3-minute stereo track at 48 kHz that is ~17 million iterations
 * each, and they only run ONCE per track load. Keeping them on the main
 * thread blocked the UI for ~100 ms+ the moment a track finished decoding.
 *
 * Clip detection (`getInitClipData`) is also moved here so the same
 * ~100 ms freeze no longer happens every time the user fiddles with
 * detection settings (silence threshold, analysis detail, min clip
 * length). The worker keeps a per-URL cache of the decoded mono samples
 * so a `redetect` message can re-run clip detection without re-fetching
 * or re-decoding.
 */

/// <reference lib="webworker" />

import {audioBufferToWavBlob} from '../utils/wav';
import {
  getInitClipData,
  type InitClipData,
  type SplitOptions,
} from '../utils/clips';

export interface WorkerDecodeRequest {
  type: 'decode';
  /** Unique request ID so the client can match responses to requests. */
  id: number;
  url: string;
  /** Split options used to compute the initial clips. */
  options: SplitOptions;
}

export interface WorkerDecodeResponse {
  type: 'decoded';
  id: number;
  url: string;
  /** WAV-encoded audio bytes (transferred, not copied). */
  wavBuffer: ArrayBuffer;
  /** Mono downmixed samples (transferred, not copied). */
  mono: Float32Array;
  sampleRate: number;
  duration: number;
  numberOfChannels: number;
  /** Original file size in bytes — used to compute bitrate. */
  byteLength: number;
  /** Initial clip-detection result for the requested SplitOptions. */
  clips: InitClipData;
}

export interface WorkerRedetectRequest {
  type: 'redetect';
  id: number;
  url: string;
  options: SplitOptions;
}

export interface WorkerRedetectResponse {
  type: 'redetected';
  id: number;
  url: string;
  clips: InitClipData;
}

export interface WorkerDecodeError {
  type: 'error';
  id: number;
  url: string;
  message: string;
}

type WorkerMessage =
  WorkerDecodeResponse | WorkerRedetectResponse | WorkerDecodeError;

type WorkerRequest =
  WorkerDecodeRequest | WorkerRedetectRequest | {type: 'evict'; url: string};

/**
 * Per-URL cache of decoded mono samples + sample rate. The worker keeps a
 * COPY of the mono (the original is transferred to the main thread on the
 * first `decode`), so subsequent `redetect` messages can re-run clip
 * detection without re-fetching or re-decoding. The copy costs one extra
 * 4 bytes * length allocation per track — ~70 MB for a 3-min stereo track
 * at 48 kHz, paid once per loaded track.
 */
const monoCache = new Map<string, {mono: Float32Array; sampleRate: number}>();
const decoding = new Map<string, object>();

/**
 * Decodes the array buffer using OfflineAudioContext (the only AudioContext
 * variant available inside a Worker). Falls back to webkitOfflineAudioContext
 * for older browsers.
 */
async function decodeArrayBuffer(
  arrayBuffer: ArrayBuffer,
): Promise<AudioBuffer> {
  const selfCtor =
    (self as unknown as {OfflineAudioContext?: typeof OfflineAudioContext})
      .OfflineAudioContext ??
    (
      self as unknown as {
        webkitOfflineAudioContext?: typeof OfflineAudioContext;
      }
    ).webkitOfflineAudioContext;
  if (!selfCtor) {
    throw new Error('OfflineAudioContext not supported in worker');
  }
  // The constructor params (channels / length / sampleRate) are only used to
  // size the resulting AudioBuffer for rendering; `decodeAudioData` ignores
  // them and returns an AudioBuffer matching the encoded file. Dummy values
  // are fine here.
  const ctx = new selfCtor(1, 1, 44100);
  return ctx.decodeAudioData(arrayBuffer);
}

self.addEventListener('message', async (e: MessageEvent<WorkerRequest>) => {
  if (e.data.type === 'evict') {
    monoCache.delete(e.data.url);
    decoding.delete(e.data.url);
    return;
  }
  const {type, id, url} = e.data;
  const post = (msg: WorkerMessage, transfer?: Transferable[]) => {
    (self as unknown as Worker).postMessage(msg, transfer ?? []);
  };

  // ----------------------------------------------------------------
  // redetect — re-run clip detection against the cached mono.
  // ----------------------------------------------------------------
  if (type === 'redetect') {
    const {options} = e.data;
    const cached = monoCache.get(url);
    if (!cached) {
      post({
        type: 'error',
        id,
        url,
        message: `No cached mono for ${url}; decode first`,
      });
      return;
    }
    try {
      const clips = getInitClipData(cached.mono, cached.sampleRate, options);
      const response: WorkerRedetectResponse = {
        type: 'redetected',
        id,
        url,
        clips,
      };
      post(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      post({type: 'error', id, url, message});
    }
    return;
  }

  // ----------------------------------------------------------------
  // decode — full pipeline: fetch → decode → downmix → encode → detect.
  // ----------------------------------------------------------------
  if (type !== 'decode') return;
  const {options} = e.data;

  const token = {};
  decoding.set(url, token);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio (${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const byteLength = arrayBuffer.byteLength;

    const audioBuffer = await decodeArrayBuffer(arrayBuffer);
    if (decoding.get(url) !== token) return;

    // Mono downmix: average every channel into one Float32Array. Same logic
    // as the previous main-thread loop in useWaveform, just off-thread.
    const channelCount = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const mono = new Float32Array(length);
    for (let c = 0; c < channelCount; c++) {
      const channel = audioBuffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        mono[i] = mono[i]! + channel[i]!;
      }
    }
    if (channelCount > 1) {
      for (let i = 0; i < length; i++) {
        mono[i] = mono[i]! / channelCount;
      }
    }

    // WAV encode using the original (multi-channel) AudioBuffer so the
    // playing audio matches the source file's channel layout. Then turn
    // the resulting Blob into an ArrayBuffer so we can transfer it.
    const wavBlob = audioBufferToWavBlob(audioBuffer);
    const wavBuffer = await wavBlob.arrayBuffer();
    if (decoding.get(url) !== token) return;

    // Initial clip detection against the requested SplitOptions. This
    // means the first set of clips is available immediately after the
    // decode completes — no second round trip needed.
    const clips = getInitClipData(mono, audioBuffer.sampleRate, options);

    // Stash a copy of the mono for future `redetect` messages. The original
    // is about to be transferred to the main thread and the worker can no
    // longer read it.
    monoCache.set(url, {
      mono: mono.slice(),
      sampleRate: audioBuffer.sampleRate,
    });

    const result: WorkerDecodeResponse = {
      type: 'decoded',
      id,
      url,
      wavBuffer,
      mono,
      sampleRate: audioBuffer.sampleRate,
      duration: audioBuffer.duration,
      numberOfChannels: channelCount,
      byteLength,
      clips,
    };

    // Transfer ownership of the two large buffers to avoid a structured
    // clone. The mono slice() above is the worker's own copy; the
    // original here is the one that gets transferred.
    post(result, [wavBuffer, mono.buffer]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const error: WorkerDecodeError = {type: 'error', id, url, message};
    post(error);
  } finally {
    if (decoding.get(url) === token) decoding.delete(url);
  }
});
