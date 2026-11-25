/**
 * Web Worker that performs the heavy audio-processing pipeline off the
 * main thread:
 *
 *   fetch(url) → decodeAudioData → mono downmix → WAV encode → clip detection
 *
 * Returns the WAV-encoded audio (as a Blob), the mono
 * downmix (as a transferable Float32Array), the metadata the UI needs
 * (sample rate, duration, channel count, file byte length), and the
 * result of clip detection for the supplied SplitOptions.
 *
 * The mono downmix + WAV encode loops are the truly expensive operations:
 * for a 3-minute stereo track at 48 kHz that is ~17 million iterations
 * each, and they only run ONCE per track load. Keeping them on the main
 * thread blocked the UI for ~100 ms+ the moment a track finished decoding.
 *
 * Clip detection (`getSectionedClipData`) is also moved here so the same
 * ~100 ms freeze no longer happens every time the user fiddles with
 * detection settings (silence threshold, analysis detail, min clip
 * length). The worker keeps a per-URL cache of the decoded mono samples
 * so a `redetect` message can re-run clip detection without re-fetching
 * or re-decoding.
 */

/// <reference lib="webworker" />

import {audioBufferToWavBlob} from '../utils/wav';
import {
  getSectionedClipData,
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
  /** WAV-encoded audio as an immutable Blob. */
  wavBlob: Blob;
  hasCachedMono: boolean;
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

// Large tracks retain their mono samples on the client only.
const maxCachedMonoBytes = 64 * 1024 * 1024;
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
  // decodeAudioData resamples to the context's rate. Keep analysis at 48 kHz
  // across the worker, main-thread fallback, and native apps.
  const ctx = new selfCtor(1, 1, 48000);
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
      const clips = getSectionedClipData(
        cached.mono,
        cached.sampleRate,
        options,
      );
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

    const wavBlob = audioBufferToWavBlob(audioBuffer);

    // Initial clip detection against the requested SplitOptions. This
    // means the first set of clips is available immediately after the
    // decode completes — no second round trip needed.
    const clips = getSectionedClipData(mono, audioBuffer.sampleRate, options);

    const hasCachedMono = mono.byteLength <= maxCachedMonoBytes;
    if (hasCachedMono) {
      monoCache.set(url, {
        mono: mono.slice(),
        sampleRate: audioBuffer.sampleRate,
      });
    } else {
      monoCache.delete(url);
    }

    const result: WorkerDecodeResponse = {
      type: 'decoded',
      id,
      url,
      wavBlob,
      hasCachedMono,
      mono,
      sampleRate: audioBuffer.sampleRate,
      duration: audioBuffer.duration,
      numberOfChannels: channelCount,
      byteLength,
      clips,
    };

    post(result, [mono.buffer]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const error: WorkerDecodeError = {type: 'error', id, url, message};
    post(error);
  } finally {
    if (decoding.get(url) === token) decoding.delete(url);
  }
});
