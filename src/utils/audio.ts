/**
 * Decoded audio data with sample buffer and byte size information.
 * Used for playback and waveform visualization.
 */
export interface DecodedAudio {
  buffer: AudioBuffer;
  byteLength: number;
}

/**
 * Cache for decoded audio buffers. Maps URLs to their decoded audio data.
 * Ensures files are decoded only once even if used in multiple components
 * (metadata, waveform, playback).
 */
const decodeCache = new Map<string, Promise<DecodedAudio>>();

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
    sharedAudioContext = new Ctor();
  }
  return sharedAudioContext;
}

/**
 * Decodes audio data from a URL using a cached buffer or new decode operation.
 * Metadata, waveform, and playback all use this function, ensuring files are
 * decoded only once and the result is shared across components.
 *
 * Strategy:
 * - On initial load (no user gesture): Creates a temporary AudioContext for decoding
 *   (may trigger a browser warning, but audio still works)
 * - After user clicks play: Uses shared AudioContext for subsequent operations
 * - Caches results to avoid redundant decodes
 *
 * @param url - The URL of the audio file to decode
 * @returns Promise resolving to decoded audio buffer and byte length
 * @throws Error if audio fetch fails or context creation is not supported
 */
export function decodeAudioBuffer(url: string): Promise<DecodedAudio> {
  // Return cached result if already decoded
  const cached = decodeCache.get(url);
  if (cached) return cached;

  const pending = (async () => {
    // Fetch the audio file
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Failed to fetch audio (${response.status})`);
    const arrayBuffer = await response.arrayBuffer();
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
        audioContext = new Ctor();
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
  })();

  decodeCache.set(url, pending);
  pending.catch(() => decodeCache.delete(url));
  return pending;
}
