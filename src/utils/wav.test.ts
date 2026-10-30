// @vitest-environment jsdom

import {describe, expect, it} from 'vitest';

import {audioBufferToWavBlob} from './wav';

/**
 * Minimal hand-rolled fake that implements just the AudioBuffer surface
 * `audioBufferToWavBlob` reads: `length`, `sampleRate`, `numberOfChannels`,
 * `getChannelData(c)`.
 *
 * We don't use the real `AudioContext.createBuffer` because jsdom doesn't
 * ship a Web Audio implementation, and the encoder only reads the four
 * properties above — it doesn't care whether the buffer came from a real
 * decode or a hand-rolled fake.
 */
function makeAudioBuffer(
  channels: Float32Array[],
  sampleRate = 48000,
): AudioBuffer {
  const length = channels[0]?.length ?? 0;
  return {
    length,
    sampleRate,
    duration: length / sampleRate,
    numberOfChannels: channels.length,
    getChannelData: (c: number) => channels[c]!,
  } as unknown as AudioBuffer;
}

describe('audioBufferToWavBlob', () => {
  it('produces a Blob with the right MIME type and the canonical 44-byte header', async () => {
    const buf = makeAudioBuffer([new Float32Array(8).fill(0)]);
    const blob = audioBufferToWavBlob(buf);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('audio/wav');

    // 44 bytes of header + 8 samples * 2 bytes/sample (mono, 16-bit) = 60.
    expect(blob.size).toBe(60);

    // First 4 bytes are the RIFF marker.
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    // Bytes 8..11 are the WAVE marker ('W' 0x57, 'A' 0x41, 'V' 0x56, 'E' 0x45)
    // → as little-endian Uint32 = 0x45564157.
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(8, true)).toBe(0x45564157);
    expect(view.getUint16(20, true)).toBe(1 /* PCM */);
    expect(view.getUint16(22, true)).toBe(1 /* mono */);
    expect(view.getUint32(24, true)).toBe(48000 /* sampleRate */);
    expect(view.getUint16(32, true)).toBe(2 /* blockAlign */);
    expect(view.getUint16(34, true)).toBe(16 /* bitsPerSample */);
  });

  it('downmixes stereo to mono by averaging the two channels', async () => {
    // Channel 0: full positive (1.0). Channel 1: full negative (-1.0).
    // Average is 0; the resulting sample should encode to ~0 (mid-point of
    // a signed 16-bit value, i.e. 0).
    const left = new Float32Array([1]);
    const right = new Float32Array([-1]);
    const buf = makeAudioBuffer([left, right]);

    const blob = audioBufferToWavBlob(buf);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    // Header (44 bytes) + 1 sample * 2 bytes = 46.
    expect(blob.size).toBe(46);
    expect(view.getUint16(22, true)).toBe(1 /* mono output */);
    // Sample 0 at byte offset 44, little-endian signed Int16.
    expect(view.getInt16(44, true)).toBe(0);
  });

  it('clamps out-of-range float samples to the [-1, 1] window', async () => {
    // Two samples, one over +1 and one under -1.
    const samples = new Float32Array([2.5, -3.0]);
    const buf = makeAudioBuffer([samples]);

    const blob = audioBufferToWavBlob(buf);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    // Sample 0 clamps to 1.0 → 0x7fff (max signed 16-bit positive).
    expect(view.getInt16(44, true)).toBe(0x7fff);
    // Sample 1 clamps to -1.0 → -0x8000 (min signed 16-bit negative).
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });

  it('writes the byteRate field as sampleRate * blockAlign (mono = sampleRate * 2)', async () => {
    const buf = makeAudioBuffer([new Float32Array(4).fill(0)], 44100);
    const blob = audioBufferToWavBlob(buf);
    const view = new DataView(await blob.arrayBuffer());
    expect(view.getUint32(28, true)).toBe(44100 * 2);
  });

  it('round-trips the PCM-encoded byte length in the data subchunk size field', async () => {
    // 100 samples * 2 bytes/sample = 200 bytes of data.
    const buf = makeAudioBuffer([new Float32Array(100).fill(0)]);
    const blob = audioBufferToWavBlob(buf);
    const view = new DataView(await blob.arrayBuffer());
    expect(view.getUint32(40, true)).toBe(200);
    // And the RIFF size field is 36 + dataSize = 236.
    expect(view.getUint32(4, true)).toBe(236);
  });

  it('encodes a full-scale positive sample as 0x7fff', async () => {
    const buf = makeAudioBuffer([new Float32Array([1])]);
    const view = new DataView(await audioBufferToWavBlob(buf).arrayBuffer());
    expect(view.getInt16(44, true)).toBe(0x7fff);
  });

  it('encodes a full-scale negative sample as -0x8000', async () => {
    const buf = makeAudioBuffer([new Float32Array([-1])]);
    const view = new DataView(await audioBufferToWavBlob(buf).arrayBuffer());
    expect(view.getInt16(44, true)).toBe(-0x8000);
  });
});
