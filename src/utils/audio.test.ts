// @vitest-environment jsdom

import {afterEach, describe, expect, it, vi} from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('analysis sample rate', () => {
  it('uses 48 kHz for both initial decoding and the shared playback context', async () => {
    vi.resetModules();
    const close = vi.fn(async () => {});
    const constructor = vi.fn<(options: AudioContextOptions) => void>();
    class FakeAudioContext {
      sampleRate: number | undefined;
      close = close;
      constructor(options: AudioContextOptions) {
        constructor(options);
        this.sampleRate = options.sampleRate;
      }
      decodeAudioData = vi.fn(async () => ({sampleRate: this.sampleRate}));
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    );
    const {decodeAudioBuffer, initializeAudioContext} = await import('./audio');
    const decoded = await decodeAudioBuffer('/rate-check.wav');
    expect(decoded.buffer.sampleRate).toBe(48000);
    expect(close).toHaveBeenCalledTimes(1);
    expect(initializeAudioContext().sampleRate).toBe(48000);
    expect(constructor).toHaveBeenCalledTimes(2);
    for (const [options] of constructor.mock.calls) {
      expect(options).toEqual({sampleRate: 48000});
    }
  });
});
