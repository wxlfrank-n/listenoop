// @vitest-environment jsdom

import {act, cleanup, fireEvent, render} from '@testing-library/react';
import {configureStore} from '@reduxjs/toolkit';
import {Provider} from 'react-redux';
import {afterEach, expect, it, vi} from 'vitest';

import analysisReducer, {
  setClips,
  setWaveform,
  setWaveformStatus,
} from '../store/analysisSlice';
import configReducer, {updateConfig} from '../store/configSlice';
import playerReducer, {setCurrentTrackIndex} from '../store/playerSlice';
import {RowWaveform} from './RowWaveform';
import {ProgressBar} from './ProgressBar';

vi.mock('./RowWaveform', () => ({
  RowWaveform: (props: React.ComponentProps<typeof RowWaveform>) => (
    <>
      <button onClick={() => props.onSwipeClip?.(0, 'up')}>Split</button>
      <button onClick={() => props.onSwipeClip?.(0, 'down')}>Merge</button>
      <output>{JSON.stringify(props.displayClips)}</output>
    </>
  ),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it.each(['clip', 'global'] as const)(
  'restores the exact split and merge results per track in %s scope',
  mergeScope => {
    const store = configureStore({
      reducer: {
        analysis: analysisReducer,
        config: configReducer,
        player: playerReducer,
      },
    });
    store.dispatch(
      updateConfig({
        mergeScope,
        waveformView: 'horizontal',
        showAdvancedControls: false,
      }),
    );
    store.dispatch(
      setWaveform({data: new Float32Array([0]), sampleRate: 1, duration: 4}),
    );
    store.dispatch(
      setClips({
        clips: [
          {start: 0, end: 1, vStart: 0, vEnd: 1},
          {start: 1, end: 2, vStart: 1, vEnd: 2},
          {start: 3, end: 4, vStart: 3, vEnd: 4},
        ],
        gaps: [0, 1],
        initGap: 0.1,
      }),
    );
    store.dispatch(setWaveformStatus('ready'));

    const open = () =>
      render(
        <Provider store={store}>
          <ProgressBar
            onSeek={vi.fn()}
            onPlayRange={vi.fn()}
            onStopPlayback={vi.fn()}
            getCurrentTime={() => 0}
          />
        </Provider>,
      );
    let view = open();
    const clips = () => view.getByRole('status').textContent;
    const initial = clips();

    fireEvent.click(view.getByRole('button', {name: 'Split'}));
    const split = clips();
    expect(split).not.toBe(initial);
    view.unmount();
    view = open();
    expect(clips()).toBe(split);

    act(() => {
      store.dispatch(setCurrentTrackIndex(1));
    });
    expect(clips()).toBe(initial);
    act(() => {
      store.dispatch(setCurrentTrackIndex(0));
    });
    expect(clips()).toBe(split);

    act(() => {
      store.dispatch(
        updateConfig({mergeScope: mergeScope === 'clip' ? 'global' : 'clip'}),
      );
    });
    expect(clips()).toBe(initial);
    act(() => {
      store.dispatch(updateConfig({mergeScope}));
    });
    expect(clips()).toBe(split);

    fireEvent.click(view.getByRole('button', {name: 'Merge'}));
    const merged = clips();
    expect(merged).not.toBe(split);
    view.unmount();
    view = open();
    expect(clips()).toBe(merged);
  },
);
