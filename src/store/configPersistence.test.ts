// @vitest-environment jsdom

import {afterEach, describe, expect, it, vi} from 'vitest';
import {store} from './store';
import configReducer, {DEFAULT_CONFIG, updateConfig} from './configSlice';
import {setCurrentTime} from './playerSlice';

afterEach(() => vi.restoreAllMocks());

describe('settings persistence', () => {
  it('keeps reducers independent of browser storage', () => {
    const save = vi.spyOn(Storage.prototype, 'setItem');
    const next = configReducer(DEFAULT_CONFIG, updateConfig({skipSeconds: 15}));
    expect(next.skipSeconds).toBe(15);
    expect(save).not.toHaveBeenCalled();
  });

  it('saves changed settings without saving on playback updates', () => {
    const save = vi.spyOn(Storage.prototype, 'setItem');
    store.dispatch(updateConfig({skipSeconds: 20}));
    expect(save).toHaveBeenCalledWith(
      'Listeenoop_config',
      JSON.stringify(store.getState().config),
    );
    save.mockClear();
    store.dispatch(setCurrentTime(3));
    expect(save).not.toHaveBeenCalled();
  });

  it('applies changes even when storage throws, and can save again later', () => {
    const save = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('Storage full', 'QuotaExceededError');
      });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => store.dispatch(updateConfig({skipSeconds: 30}))).not.toThrow();
    expect(store.getState().config.skipSeconds).toBe(30);
    save.mockImplementation(() => {});
    store.dispatch(updateConfig({skipSeconds: 10}));
    expect(save).toHaveBeenCalledTimes(2);
  });
});

it('retires the old split-piece setting and preserves the single clip minimum', async () => {
  vi.resetModules();
  localStorage.setItem(
    'Listeenoop_config',
    JSON.stringify({
      minClipLength: 0.7,
      minSplitPieceSec: 0.4,
      minSilenceSec: 0.2,
    }),
  );
  const {default: reducer} = await import('./configSlice');
  const config = reducer(undefined, {type: 'init'});
  expect(config.minClipLength).toBe(0.7);
  expect(config).not.toHaveProperty('minSplitPieceSec');
  expect(config).not.toHaveProperty('minSilenceSec');
  localStorage.clear();
});

it('migrates and bounds the expansion rate while preserving older settings', async () => {
  for (const [stored, expected] of [
    [{}, 0.25],
    [{expansionRate: 0.33}, 0.33],
    [{expansionRate: 0.1}, 0.25],
    [{expansionRate: 0.9}, 0.4],
    [{expansionRate: 'bad'}, 0.25],
  ] as const) {
    vi.resetModules();
    localStorage.setItem(
      'Listeenoop_config',
      JSON.stringify({minClipLength: 0.7, ...stored}),
    );
    const {default: reducer} = await import('./configSlice');
    const config = reducer(undefined, {type: 'init'});
    expect(config.expansionRate).toBe(expected);
    expect(config.minClipLength).toBe(0.7);
  }
  localStorage.clear();
});

it('loads and bounds saved speed without dropping older settings', async () => {
  for (const [stored, expected] of [
    [{}, 1],
    [{playbackSpeed: 0.75}, 0.75],
    [{playbackSpeed: 0.1}, 0.5],
    [{playbackSpeed: 5}, 1.5],
    [{playbackSpeed: 'bad'}, 1],
  ] as const) {
    vi.resetModules();
    localStorage.setItem(
      'Listeenoop_config',
      JSON.stringify({skipSeconds: 15, ...stored}),
    );
    const {default: reducer} = await import('./configSlice');
    const config = reducer(undefined, {type: 'init'});
    expect(config.playbackSpeed).toBe(expected);
    expect(config.skipSeconds).toBe(15);
  }
  localStorage.clear();
});
