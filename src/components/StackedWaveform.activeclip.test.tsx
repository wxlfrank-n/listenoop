// @vitest-environment jsdom

import {render, act} from '@testing-library/react';
import type {ComponentProps} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {configureStore} from '@reduxjs/toolkit';
import {Provider} from 'react-redux';
import {StackedWaveform} from './StackedWaveform';
import type {WaveformData} from '../types';
import type {Clip as InitClipData} from '../utils/clips';
import analysisReducer from '../store/analysisSlice';
import configReducer from '../store/configSlice';
import playerReducer from '../store/playerSlice';

function makeStore() {
  return configureStore({
    reducer: {
      analysis: analysisReducer,
      config: configReducer,
      player: playerReducer,
    },
  });
}

class FakeResizeObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
}

const DURATION = 36;

const waveform: WaveformData = {
  data: new Float32Array(DURATION * 100),
  sampleRate: 100,
  duration: DURATION,
};

/** `count` clips of `length` seconds each, laid out end to end. */
function clipsOf(count: number, length: number): InitClipData[] {
  return Array.from({length: count}, (_, i) => ({
    start: i * length,
    end: (i + 1) * length,
    vStart: i * length,
    vEnd: (i + 1) * length,
  }));
}

/*
 * Both lists cover the same 36s track; only the clip lengths differ, which
 * re-packs the rows and moves the shared page boundary from 18s to 15s.
 *
 * 3s clips: three per row, so page 1 covers 0-18s.
 * 1.5s clips: five per row, so page 1 covers 0-15s.
 */
const longClips = clipsOf(12, 3);
const shortClips = clipsOf(24, 1.5);

function setup() {
  const scrollTo = vi.fn();
  (HTMLElement.prototype as unknown as {scrollTo: typeof scrollTo}).scrollTo =
    scrollTo;

  const setPointerCapture = vi.fn();
  (
    HTMLElement.prototype as unknown as {
      setPointerCapture: typeof setPointerCapture;
    }
  ).setPointerCapture = setPointerCapture;

  const props: ComponentProps<typeof StackedWaveform> = {
    waveform,
    displayClips: longClips,
    currentTime: 0,
    playing: false,
    activeClip: -1,
    repetitions: 3,
    onSeek: vi.fn(),
    onActiveClipChange: vi.fn(),
    onPlayRange: vi.fn(),
    onStopPlayback: vi.fn(),
    onSwipeClip: vi.fn(),
    getCurrentTime: () => props.currentTime,
  };

  const store = makeStore();
  const view = render(
    <Provider store={store}>
      <StackedWaveform {...props} />
    </Provider>,
  );

  const rerender = (
    partial: Partial<ComponentProps<typeof StackedWaveform>>,
  ) => {
    Object.assign(props, partial);
    view.rerender(
      <Provider store={store}>
        <StackedWaveform {...props} />
      </Provider>,
    );
  };

  const pageNumber = () =>
    view.container.querySelector('.stacked-waveform__pageno')?.textContent ??
    '';

  return {scrollTo, rerender, pageNumber};
}

beforeEach(() => {
  (globalThis as unknown as {ResizeObserver: unknown}).ResizeObserver =
    FakeResizeObserver;
  // jsdom reports zero sizes. A 800x200 scroller gives a 12s window and two
  // rows per page.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 800,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 200,
  });
  vi.useFakeTimers();
});

afterEach(() => {
  delete (HTMLElement.prototype as unknown as {clientWidth?: number})
    .clientWidth;
  delete (HTMLElement.prototype as unknown as {clientHeight?: number})
    .clientHeight;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('stacked waveform active-clip follow', () => {
  it('keeps the page when a split or merge re-packs the edited clip onto another page', async () => {
    const {scrollTo, rerender, pageNumber} = setup();

    // Page 1 shows 0-18s, so the clip at 16.5s is on screen.
    expect(pageNumber()).toBe('1 / 2');

    scrollTo.mockClear();

    // Shorter clips re-pack the rows, so that clip now starts page 2. It was
    // on screen when the user edited it, so do not page away.
    rerender({displayClips: shortClips, activeClip: 11});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(pageNumber()).toBe('1 / 3');
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('pages to an active clip that was not on the current page', async () => {
    const {scrollTo, rerender, pageNumber} = setup();

    scrollTo.mockClear();

    // 33s was never on page 1 (0-18s).
    rerender({displayClips: shortClips, activeClip: 22});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(pageNumber()).toBe('3 / 3');
    expect(scrollTo).toHaveBeenCalledWith({left: 1600, behavior: 'smooth'});
  });
});
