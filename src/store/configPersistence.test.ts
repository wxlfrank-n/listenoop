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
