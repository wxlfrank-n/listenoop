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
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

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

  let offset = 44;
  if (numCh === 1) {
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]!));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  } else {
    const ch0 = buffer.getChannelData(0);
    const ch1 = buffer.getChannelData(1);
    for (let i = 0; i < length; i++) {
      const s = Math.max(-1, Math.min(1, (ch0[i]! + ch1[i]!) * 0.5));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], {type: 'audio/wav'});
}
