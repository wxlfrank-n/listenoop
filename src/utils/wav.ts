/**
 * Encodes a decoded AudioBuffer as a mono WAV blob.
 *
 * Why WAV?
 * - Playing WAV (instead of raw MP3) makes the audio element timeline
 *   identical to the waveform and clips, which are also built from
 *   decodeAudioData on a mono downmix
 * - What you see is what you play
 * - Downmixing to mono halves the blob and memory usage on constrained browsers
 *
 * @param buffer - The decoded AudioBuffer (may be mono or stereo)
 * @returns A Blob containing WAV-encoded mono audio data
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const length = buffer.length;
  const sampleRate = buffer.sampleRate;
  const numCh = buffer.numberOfChannels;
  const dataSize = length * 2;
  if (dataSize > 0xffffffff - 36) {
    throw new RangeError('Audio exceeds the WAV size limit');
  }
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // Helper to write ASCII string to buffer (for WAV header markers like "RIFF", "WAVE", etc.)
  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const parts: BlobPart[] = [header];
  const chunkSamples = 256 * 1024;
  const chunk = new ArrayBuffer(Math.min(length, chunkSamples) * 2);
  const pcm = new DataView(chunk);
  const left = buffer.getChannelData(0);
  const right = numCh > 1 ? buffer.getChannelData(1) : left;
  for (let start = 0; start < length; start += chunkSamples) {
    const count = Math.min(chunkSamples, length - start);
    for (let i = 0; i < count; i++) {
      const index = start + i;
      const sample = Math.max(
        -1,
        Math.min(1, (left[index]! + right[index]!) * 0.5),
      );
      pcm.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    // Blob snapshots this chunk, so the same scratch buffer can be reused.
    parts.push(new Blob([new Uint8Array(chunk, 0, count * 2)]));
  }
  return new Blob(parts, {type: 'audio/wav'});
}
