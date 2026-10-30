/**
 * Promise-based client for `audioDecoder.worker.ts`.
 *
 * Wraps the worker so callers can write `await decodeAudio(url, options, signal)`
 * instead of fiddling with message IDs and transferables. Caches the
 * Promise by URL so the three call sites that all decode the same track
 * (waveform hook, audio-meta hook, playback hook) share ONE worker round
 * trip and ONE set of transferred buffers.
 *
 * Per-caller abort handling:
 *   The cache holds a single "core" Promise per URL — it resolves/rejects
 *   based on the worker's response and is NEVER aborted by an individual
 *   caller's signal. Each caller instead gets a thin wrapper Promise that
 *   rejects with `AbortError` only for THAT caller when their signal fires,
 *   without touching the shared core. This matters in React StrictMode
 *   (dev) where `useWaveform` mounts → cleans up → re-mounts in quick
 *   succession: the cleanup aborts `useWaveform`'s wrapper, but the
 *   in-flight decode shared by `useAudioPlayer`'s `getPlayableUrl` is
 *   unaffected and resolves normally when the worker responds.
 *
 * Falls back to the previous main-thread implementation when:
 *   - The Worker or `OfflineAudioContext` API it depends on is unavailable
 *     (notably older iOS Safari, which exposes `OfflineAudioContext` only
 *     on the main thread, not inside a Worker).
 *   - The Worker reports an "environmental" error (missing
 *     `OfflineAudioContext` in its scope). Once detected, all subsequent
 *     decode/redetect calls skip the worker entirely so users on those
 *     browsers don't pay the failed round-trip tax on every track.
 *
 * The fallback reuses `decodeAudioBuffer` + `audioBufferToWavBlob` +
 * `getInitClipData` on the main thread (`decodeAudioBuffer` uses the regular
 * `AudioContext`, which IS available on the main thread in every browser
 * that supports Web Audio). The app still works — just with the old UI
 * freeze during decode.
 */

import AudioDecoderWorker from './audioDecoder.worker.ts?worker';
import {decodeAudioBuffer} from '../utils/audio';
import {audioBufferToWavBlob} from '../utils/wav';
import {
  getInitClipData,
  type InitClipData,
  type SplitOptions,
} from '../utils/clips';
import type {
  WorkerDecodeResponse,
  WorkerRedetectResponse,
  WorkerDecodeError,
} from './audioDecoder.worker';

/**
 * Error message the worker emits when its scope lacks
 * `OfflineAudioContext`/`webkitOfflineAudioContext`. Must stay in sync with
 * the string in `audioDecoder.worker.ts` (`decodeArrayBuffer`).
 *
 * When the client receives this message it flips `workerDecodeCapable` to
 * false and re-runs the in-flight request on the main thread.
 */
export const WORKER_OFFLINE_AUDIO_UNSUPPORTED =
  'OfflineAudioContext not supported in worker';

export interface DecodeResult {
  /** WAV-encoded audio as a Blob (ready for `URL.createObjectURL`). */
  wavBlob: Blob;
  /** Mono downmixed samples (the same data the worker transferred). */
  mono: Float32Array;
  sampleRate: number;
  duration: number;
  numberOfChannels: number;
  /** Original file size in bytes — used to compute bitrate. */
  byteLength: number;
  /** Initial clip-detection result for the supplied SplitOptions. */
  clips: InitClipData;
}

let worker: Worker | null = null;
let nextRequestId = 1;

/**
 * Once the worker reports that its scope can't decode audio (no
 * `OfflineAudioContext`), flip this to false so all subsequent calls skip
 * the worker entirely. Browsers that hit this once will hit it for every
 * URL — the capability doesn't change at runtime — so caching the
 * negative result avoids a redundant failed round-trip per track.
 */
let workerDecodeCapable = true;

// Pending worker requests keyed by request id. Each entry holds the
// resolve/reject pair, the URL, and the options so the message handler can
// re-route the request to the main-thread fallback if the worker reports
// an environmental failure (rather than just rejecting and losing the
// request). The per-caller abort signal is NOT stored here — it lives on
// the wrapper Promise returned to each caller (see `wrapWithAbortSignal`).
const pending = new Map<
  number,
  {
    resolve: (r: DecodeResult) => void;
    reject: (e: Error) => void;
    url: string;
    options: SplitOptions;
  }
>();

const pendingRedetect = new Map<
  number,
  {
    resolve: (r: InitClipData) => void;
    reject: (e: Error) => void;
    url: string;
    options: SplitOptions;
  }
>();

// Per-URL Promise cache for the full decode. Once a URL has been decoded,
// subsequent callers get the same Promise — and hence the same transferred
// `mono` and `wavBlob`. JS references make this safe: there's only one
// decode, and every caller reads the same memory. The cache holds the
// CORE promise (no per-caller signal); callers see a wrapper that adds
// their own abort semantics on top.
const cache = new Map<string, Promise<DecodeResult>>();

/** Release all decoded data for a track that has left the playlist. */
export function evictAudio(url: string): void {
  cache.delete(url);
  const error = new DOMException('Track removed', 'AbortError');
  for (const requests of [pending, pendingRedetect]) {
    for (const [id, entry] of requests) {
      if (entry.url === url) {
        requests.delete(id);
        entry.reject(error);
      }
    }
  }
  worker?.postMessage({type: 'evict', url});
}

/**
 * Wraps `promise` so the returned Promise rejects with `AbortError` when
 * `signal` aborts, WITHOUT affecting the underlying `promise`. Multiple
 * callers can wrap the same core promise; each wrapper rejects
 * independently when its own signal fires.
 *
 * This is the key StrictMode-safety mechanism: `useWaveform`'s cleanup
 * aborting its signal no longer propagates to `useAudioPlayer`'s await on
 * the same shared core promise.
 */
function wrapWithAbortSignal<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }
  return new Promise<T>((resolve, reject) => {
    let aborted = false;
    const onAbort = () => {
      aborted = true;
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, {once: true});
    promise.then(
      result => {
        signal.removeEventListener('abort', onAbort);
        if (!aborted) resolve(result);
      },
      err => {
        signal.removeEventListener('abort', onAbort);
        if (!aborted) reject(err);
      },
    );
  });
}

function getWorker(): Worker {
  if (!worker) {
    worker = new AudioDecoderWorker();
    worker.addEventListener('message', (e: MessageEvent) => {
      const data = e.data as
        WorkerDecodeResponse | WorkerRedetectResponse | WorkerDecodeError;

      if (data.type === 'redetected') {
        const entry = pendingRedetect.get(data.id);
        if (!entry) return;
        pendingRedetect.delete(data.id);
        entry.resolve(data.clips);
        return;
      }

      if (data.type === 'decoded') {
        const entry = pending.get(data.id);
        if (!entry) return;
        pending.delete(data.id);
        const result: DecodeResult = {
          wavBlob: new Blob([data.wavBuffer], {type: 'audio/wav'}),
          mono: data.mono,
          sampleRate: data.sampleRate,
          duration: data.duration,
          numberOfChannels: data.numberOfChannels,
          byteLength: data.byteLength,
          clips: data.clips,
        };
        entry.resolve(result);
        return;
      }

      // data.type === 'error' — look up in both pending maps. Errors
      // don't carry the request type, so a redetect failure used to fall
      // through to the `pending` (decode) lookup, miss, and silently leak
      // the promise. Handle both maps explicitly here.
      const decodeEntry = pending.get(data.id);
      if (decodeEntry) {
        pending.delete(data.id);
        if (data.message === WORKER_OFFLINE_AUDIO_UNSUPPORTED) {
          // Environmental failure — the worker scope can't decode. Flip
          // the global flag so future calls skip the worker, then re-route
          // this in-flight request to the main-thread fallback.
          workerDecodeCapable = false;
          decodeViaMainThread(decodeEntry.url, decodeEntry.options).then(
            decodeEntry.resolve,
            decodeEntry.reject,
          );
        } else {
          decodeEntry.reject(new Error(data.message));
        }
        return;
      }

      const redetectEntry = pendingRedetect.get(data.id);
      if (redetectEntry) {
        pendingRedetect.delete(data.id);
        if (data.message === WORKER_OFFLINE_AUDIO_UNSUPPORTED) {
          workerDecodeCapable = false;
          redetectViaMainThread(redetectEntry.url, redetectEntry.options).then(
            redetectEntry.resolve,
            redetectEntry.reject,
          );
        } else {
          redetectEntry.reject(new Error(data.message));
        }
      }
    });
    worker.addEventListener('error', e => {
      // Worker failed to spawn or threw an unhandled error. Reject every
      // pending request so callers don't hang forever. Also flip the
      // capability flag so subsequent calls don't try to spawn another
      // worker that will just crash the same way.
      workerDecodeCapable = false;
      for (const [id, entry] of pending) {
        pending.delete(id);
        entry.reject(new Error(e.message || 'Worker crashed'));
      }
      for (const [id, entry] of pendingRedetect) {
        pendingRedetect.delete(id);
        entry.reject(new Error(e.message || 'Worker crashed'));
      }
    });
  }
  return worker;
}

/**
 * Decode the audio at `url` off the main thread and return the WAV blob,
 * the mono samples, metadata, and the initial clips. Subsequent calls with
 * the same URL return the same core Promise (wrapped with the caller's
 * signal), so all callers share one worker round-trip and one set of
 * transferred buffers.
 *
 * If `signal` is provided and aborts while the decode is in flight, the
 * returned Promise rejects with an `AbortError` — but ONLY for that
 * caller. The shared core decode continues running, the cache entry
 * remains populated, and other callers (e.g. `useAudioPlayer`'s
 * `getPlayableUrl`, which passes no signal) still resolve normally when
 * the worker responds. This is what makes the design StrictMode-safe.
 *
 * Note: the worker's own `fetch` and `decodeAudioData` are NOT actually
 * interruptible from the client (the Web Audio API doesn't expose an abort
 * primitive, and the worker doesn't accept a signal in its message). The
 * per-caller `AbortError` is purely a client-side "stop waiting" — the
 * in-flight decode finishes in the background and the result lands in the
 * cache, available to a future caller for the same URL.
 *
 * The `options` arg drives the initial clip-detection pass; if the user
 * later changes detection settings, call `redetectClips(url, options)`.
 */
export function decodeAudio(
  url: string,
  options: SplitOptions,
  signal?: AbortSignal,
): Promise<DecodeResult> {
  const cached = cache.get(url);
  if (cached) return wrapWithAbortSignal(cached, signal);

  // If a previous call already discovered the worker can't decode (no
  // `OfflineAudioContext` in its scope, or the worker failed to spawn),
  // skip the worker round-trip and decode on the main thread directly.
  if (!workerDecodeCapable) {
    const mainPromise = decodeViaMainThread(url, options);
    cache.set(url, mainPromise);
    mainPromise.catch(() => {
      if (cache.get(url) === mainPromise) cache.delete(url);
    });
    return wrapWithAbortSignal(mainPromise, signal);
  }

  // Core promise: stored in the cache, never aborted per-caller. Resolves
  // when the worker reports `decoded`, rejects on real worker errors,
  // falls back to main-thread decode on environmental failures.
  const corePromise = new Promise<DecodeResult>((resolve, reject) => {
    const id = nextRequestId++;
    pending.set(id, {resolve, reject, url, options});

    try {
      getWorker().postMessage({type: 'decode', id, url, options} satisfies {
        type: 'decode';
        id: number;
        url: string;
        options: SplitOptions;
      });
    } catch {
      // Worker construction failed (e.g. CSP, environment without Worker
      // support). Fall back to the main-thread decode so the app still
      // functions.
      workerDecodeCapable = false;
      pending.delete(id);
      decodeViaMainThread(url, options).then(resolve, reject);
    }
  });

  // Cache the core Promise so subsequent callers share it. If it rejects
  // (real worker error — never per-caller abort, since the per-caller
  // abort goes to the wrapper, not the core), evict so a retry can start
  // fresh.
  cache.set(url, corePromise);
  corePromise.catch(() => {
    if (cache.get(url) === corePromise) cache.delete(url);
  });

  return wrapWithAbortSignal(corePromise, signal);
}

/**
 * Re-run clip detection against the cached mono samples for `url` using
 * the supplied `options`. The worker keeps a copy of the mono from the
 * previous `decode`, so this is fast (~10–50 ms for typical tracks) and
 * does not re-fetch or re-decode.
 *
 * Rejects if `url` has not been decoded via `decodeAudio` first — the
 * worker has no mono to operate on. Callers should only invoke this once
 * the waveform is in the `'ready'` state.
 */
export function redetectClips(
  url: string,
  options: SplitOptions,
): Promise<InitClipData> {
  // If the worker can't decode, it also has no mono cache. Re-run clip
  // detection against the main-thread decode result instead.
  if (!workerDecodeCapable) {
    return redetectViaMainThread(url, options);
  }

  return new Promise<InitClipData>((resolve, reject) => {
    const id = nextRequestId++;
    pendingRedetect.set(id, {resolve, reject, url, options});

    try {
      getWorker().postMessage({type: 'redetect', id, url, options} satisfies {
        type: 'redetect';
        id: number;
        url: string;
        options: SplitOptions;
      });
    } catch {
      // Worker failed — fall back to main-thread detection. We can't
      // access the cached mono here (it lives in the worker), so reject
      // unless we have a cached decode result on the client side.
      workerDecodeCapable = false;
      pendingRedetect.delete(id);
      redetectViaMainThread(url, options).then(resolve, reject);
    }
  });
}

/**
 * Re-runs clip detection on the main thread using the cached
 * `decodeAudio` result for `url`. Used when the worker can't be reached
 * (environmental failure or construction failure). Reads from the same
 * per-URL Promise cache that `decodeAudio` populates, so the mono samples
 * are shared across all callers and never re-decoded.
 */
function redetectViaMainThread(
  url: string,
  options: SplitOptions,
): Promise<InitClipData> {
  const cached = cache.get(url);
  if (!cached) {
    return Promise.reject(new Error('No cached decode for redetectClips'));
  }
  return cached.then(result =>
    getInitClipData(result.mono, result.sampleRate, options),
  );
}

/**
 * Main-thread fallback when the worker can't run. Uses the existing
 * `decodeAudioBuffer` + `audioBufferToWavBlob` + `getInitClipData` so
 * behaviour matches the pre-worker implementation exactly.
 *
 * `decodeAudioBuffer` uses the regular `AudioContext` (NOT
 * `OfflineAudioContext`), which IS available on the main thread in every
 * browser that supports Web Audio — including Safari, which is the most
 * common case where the worker path fails.
 *
 * Note: no `signal` parameter — the shared core decode is never aborted
 * per-caller. Callers that need abort semantics get them via the
 * `wrapWithAbortSignal` wrapper returned by `decodeAudio`.
 */
async function decodeViaMainThread(
  url: string,
  options: SplitOptions,
): Promise<DecodeResult> {
  const {buffer, byteLength} = await decodeAudioBuffer(url);

  // Mono downmix (same loop as the worker).
  const channelCount = buffer.numberOfChannels;
  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let c = 0; c < channelCount; c++) {
    const channel = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      mono[i] = mono[i]! + channel[i]!;
    }
  }
  if (channelCount > 1) {
    for (let i = 0; i < length; i++) {
      mono[i] = mono[i]! / channelCount;
    }
  }

  const wavBlob = audioBufferToWavBlob(buffer);
  const clips = getInitClipData(mono, buffer.sampleRate, options);

  return {
    wavBlob,
    mono,
    sampleRate: buffer.sampleRate,
    duration: buffer.duration,
    numberOfChannels: channelCount,
    byteLength,
    clips,
  };
}
