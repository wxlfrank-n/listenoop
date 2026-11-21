// @vitest-environment jsdom

import {cleanup, fireEvent, render} from '@testing-library/react';
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {configureStore} from '@reduxjs/toolkit';
import {Provider} from 'react-redux';
import configReducer, {updateConfig} from '../store/configSlice';
import playerReducer from '../store/playerSlice';
import analysisReducer, {setClips} from '../store/analysisSlice';
import {ClipToolbar} from './ClipToolbar';

afterEach(cleanup);

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  globalThis.ResizeObserver = FakeResizeObserver;
});

function makeStore() {
  return configureStore({
    reducer: {
      config: configReducer,
      player: playerReducer,
      analysis: analysisReducer,
    },
  });
}

function renderToolbar(
  store: ReturnType<typeof makeStore>,
  showMergeSlider?: boolean,
  onMergeGapChange = (_gap: number) => {},
  disabled = false,
) {
  store.dispatch(updateConfig({showAdvancedControls: true}));
  return render(
    <Provider store={store}>
      <ClipToolbar
        mergeGap={0.01}
        clipCount={3}
        onMergeGapChange={onMergeGapChange}
        repetitions={3}
        onRepetitionsChange={() => {}}
        showMergeSlider={showMergeSlider}
        disabled={disabled}
      />
    </Provider>,
  );
}

describe('ClipToolbar', () => {
  it('can step below the shortest positive gap', () => {
    const store = makeStore();
    store.dispatch(setClips({clips: [], gaps: [0.01, 0.3], initGap: 0.155}));
    const onMergeGapChange = vi.fn();
    const {getByRole} = renderToolbar(store, true, onMergeGapChange);

    fireEvent.click(getByRole('button', {name: 'Merge fewer clips'}));

    expect(onMergeGapChange).toHaveBeenCalledWith(0);
  });

  it('switches to Clip scope only on a double-click in the gap', () => {
    const store = makeStore();
    store.dispatch(updateConfig({mergeScope: 'global'}));
    const {container, getByRole} = renderToolbar(store, true);
    const toolbar = container.querySelector('.clip-toolbar')!;

    fireEvent.doubleClick(getByRole('slider', {name: 'Repeats:'}));
    fireEvent.doubleClick(toolbar);
    expect(store.getState().config.mergeScope).toBe('global');

    const gap = container.querySelector('.clip-toolbar__scope-gap')!;
    fireEvent.click(gap);
    expect(store.getState().config.mergeScope).toBe('global');

    fireEvent.click(gap);
    expect(store.getState().config.mergeScope).toBe('clip');
  });

  it.each([false, true])(
    'switches to Global scope only from empty space (playing: %s)',
    playing => {
      const store = makeStore();
      store.dispatch(updateConfig({mergeScope: 'clip'}));
      const {container, getByRole} = renderToolbar(
        store,
        false,
        undefined,
        playing,
      );
      const toolbar = container.querySelector('.clip-toolbar--clip-scope')!;

      fireEvent.doubleClick(getByRole('slider', {name: 'Repeats:'}));
      fireEvent.doubleClick(container.querySelector('.clip-reps__label')!);
      fireEvent.click(toolbar);
      expect(store.getState().config.mergeScope).toBe('clip');

      fireEvent.click(toolbar);
      expect(store.getState().config.mergeScope).toBe('global');
    },
  );

  it('renders the merge and repeat controls', () => {
    const store = makeStore();
    const {container} = renderToolbar(store);
    expect(container.querySelector('.clip-merge')).not.toBeNull();
    expect(container.querySelector('.clip-reps')).not.toBeNull();
  });

  it('hides the merge slider but keeps the repeat stepper', () => {
    // Clip scope merges per clip through the swipe gestures, so the
    // track-wide merge gap has no slider.
    const store = makeStore();
    const {container} = renderToolbar(store, false);
    expect(container.querySelector('.clip-merge')).toBeNull();
    expect(container.querySelector('.clip-reps')).not.toBeNull();
  });

  it('drops the repeats label while the merge control shares the row', () => {
    const store = makeStore();
    const {container} = renderToolbar(store, true);
    expect(container.querySelector('.clip-reps__label')).toBeNull();
  });

  it('keeps the repeats label when the merge control is hidden', () => {
    const store = makeStore();
    const {container} = renderToolbar(store, false);
    expect(container.querySelector('.clip-reps__label')).not.toBeNull();
  });

  it('hides the toolbar on a swipe down', () => {
    const store = makeStore();
    renderToolbar(store);

    const bar = document.querySelector('.clip-toolbar')!;
    fireEvent.pointerDown(bar, {clientX: 100, clientY: 0});
    fireEvent.pointerUp(bar, {clientX: 100, clientY: 40});
    expect(store.getState().config.showAdvancedControls).toBe(false);
  });

  it('does not hide the toolbar on a swipe up', () => {
    const store = makeStore();
    renderToolbar(store);

    const bar = document.querySelector('.clip-toolbar')!;
    fireEvent.pointerDown(bar, {clientX: 100, clientY: 40});
    fireEvent.pointerUp(bar, {clientX: 100, clientY: 0});
    expect(store.getState().config.showAdvancedControls).toBe(true);
  });
});
