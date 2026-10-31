import {beforeEach, describe, expect, it, vi} from 'vitest';

const fake = vi.hoisted(() => ({
  postMessage: vi.fn(),
  handlers: new Map<string, (event: {data: unknown}) => void>(),
}));

vi.mock('./audioDecoder.worker.ts?worker', () => ({
  default: class {
    postMessage = fake.postMessage;
    addEventListener(type: string, handler: (event: {data: unknown}) => void) {
      fake.handlers.set(type, handler);
    }
  },
}));

beforeEach(() => {
  vi.resetModules();
  fake.postMessage.mockClear();
  fake.handlers.clear();
});

describe('decoded audio eviction', () => {
  it('discards pending results without deleting a newer decode of the same URL', async () => {
    const {decodeAudio, evictAudio} = await import('./audioDecoderClient');
    const options = {
      blockMs: 12,
      silenceRatio: 0.01,
      minClipLength: 0.3,
    };
    const first = decodeAudio('/track.mp3', options);
    const rejected = expect(first).rejects.toMatchObject({name: 'AbortError'});
    const firstId = fake.postMessage.mock.calls[0]![0].id;
    evictAudio('/track.mp3');
    expect(fake.postMessage).toHaveBeenCalledWith({
      type: 'evict',
      url: '/track.mp3',
    });
    const second = decodeAudio('/track.mp3', options);
    const secondId = fake.postMessage.mock.calls.at(-1)![0].id;
    await rejected;
    expect(decodeAudio('/track.mp3', options)).toBe(second);
    const response = {
      type: 'decoded',
      url: '/track.mp3',
      wavBuffer: new ArrayBuffer(8),
      mono: new Float32Array(4),
      sampleRate: 48000,
      duration: 1,
      numberOfChannels: 1,
      byteLength: 8,
      clips: {clips: [], gaps: [], initGap: 0},
    };
    fake.handlers.get('message')!({data: {...response, id: firstId}});
    fake.handlers.get('message')!({data: {...response, id: secondId}});
    await expect(second).resolves.toMatchObject({duration: 1});
    evictAudio('/track.mp3');
    const third = decodeAudio('/track.mp3', options);
    expect(third).not.toBe(second);
    const cleanup = expect(third).rejects.toMatchObject({name: 'AbortError'});
    evictAudio('/track.mp3');
    await cleanup;
  });
});
