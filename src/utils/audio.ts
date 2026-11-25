/**
 * Decoded audio data with sample buffer and byte size information.
 * Used for playback and waveform visualization.
 */
export interface DecodedAudio {
  buffer: AudioBuffer;
  byteLength: number;
}

/**
 * Shared global AudioContext for playback and waveform analysis.
 * Created lazily on first user gesture (e.g., click play) to comply with
 * browser autoplay policy. This allows the Web Audio API to work without
 * triggering security warnings.
 *
 * Browser Autoplay Policy:
 * - AudioContext cannot be created or resumed without a user gesture
 * - Creating one in effects or non-gesture contexts will trigger warnings
 * - Solution: Initialize on first user interaction, then reuse for app lifetime
 */
let sharedAudioContext: AudioContext | null = null;

/**
 * Initializes and returns the shared AudioContext.
 * Must be called from a user gesture context (e.g., click handler).
 * Subsequent calls return the same instance.
 *
 * @throws {Error} If AudioContext is not supported by the browser
 * @returns The shared AudioContext instance
 */
export function initializeAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    // Ctor = AudioContext class; picks the browser-supported constructor, trying
    // the standard one first and falling back to webkit for older browsers.
    const Ctor =
      window.AudioContext ??
      (window as unknown as {webkitAudioContext?: typeof AudioContext})
        .webkitAudioContext;
    if (!Ctor) throw new Error('AudioContext not supported');
    sharedAudioContext = new Ctor({sampleRate: 48000});
  }
  return sharedAudioContext;
}

/**
 * Decodes a URL using the shared context or a temporary one.
 * The decoder client caches the processed result, so the original multichannel
 * PCM can be released after processing.
 *
 * @param url - The URL of the audio file to decode
 * @param signal - Optional AbortSignal; aborts the in-flight `fetch` (the
 *   subsequent `decodeAudioData` call is un-interruptible, but at least the
 *   network transfer stops and the result is discarded).
 * @returns Promise resolving to decoded audio buffer and byte length
 * @throws Error if audio fetch fails or context creation is not supported
 */
export async function decodeAudioBuffer(
  url: string,
  signal?: AbortSignal,
): Promise<DecodedAudio> {
  // Fetch the audio file. Pass the signal so the network transfer aborts
  // when the caller switches tracks mid-decode.
  const response = await fetch(url, signal ? {signal} : undefined);
  if (!response.ok)
    throw new Error(`Failed to fetch audio (${response.status})`);
  const arrayBuffer = await response.arrayBuffer();
  // If we were aborted during fetch/arrayBuffer read, bail before the
  // expensive decode step (which is itself un-interruptible).
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  // `decodeAudioData` detaches (transfers) its input buffer, after which
  // `byteLength` reads 0. Capture the size up front so the bitrate stays
  // accurate.
  const byteLength = arrayBuffer.byteLength;

  // Use shared context if available (player initialized), else create temporary one
  let audioContext = sharedAudioContext;
  let isTemporary = false;

  if (!audioContext) {
    try {
      // Create temporary context for decoding (may trigger browser warning but works)
      // Try standard AudioContext first, fall back to webkit for older browsers
      const Ctor =
        window.AudioContext ??
        (window as unknown as {webkitAudioContext?: typeof AudioContext})
          .webkitAudioContext;
      if (!Ctor) throw new Error('AudioContext not supported');
      audioContext = new Ctor({sampleRate: 48000});
      isTemporary = true;
    } catch (err) {
      // Can't create context - likely no user gesture or unsupported browser
      console.debug('Failed to create temporary AudioContext:', err);
      throw new Error(
        'AudioContext not initialized. Please click play to start audio.',
      );
    }
  }

  try {
    const buffer = await audioContext.decodeAudioData(arrayBuffer);
    return {buffer, byteLength};
  } finally {
    // Only close if we created a temporary context (keep shared context alive)
    if (isTemporary) {
      await audioContext.close();
    }
  }
}
