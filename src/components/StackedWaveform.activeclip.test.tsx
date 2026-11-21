// @vitest-environment jsdom

import {render, act, fireEvent} from '@testing-library/react';
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
 * re-packs the rows.
 *
 * With 45px minimum clips the row window is ~5.33s.
 * 3s clips: one per row, so page 1 covers 0-6s.
 * 1.5s clips: three per row, so page 1 covers 0-9s.
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

  const scroller = view.container.querySelector(
    '.stacked-waveform',
  ) as HTMLElement;

  return {scrollTo, rerender, pageNumber, scroller, onPlayRange: props.onPlayRange};
}

beforeEach(() => {
  (globalThis as unknown as {ResizeObserver: unknown}).ResizeObserver =
    FakeResizeObserver;
  // jsdom reports zero sizes. An 800x200 scroller gives a ~5.33s window and
  // two rows per page.
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
  it('updates the visible clips when scrolling during an automatic page change', () => {
    const {rerender, pageNumber, scroller} = setup();

    rerender({displayClips: shortClips, activeClip: 22});
    expect(pageNumber()).toBe('4 / 4');

    act(() => {
      scroller.scrollLeft = 800;
      scroller.dispatchEvent(new Event('scroll'));
    });

    expect(pageNumber()).toBe('2 / 4');
    const pages = scroller.querySelectorAll('.stacked-waveform__page');
    expect(pages[1]?.querySelector('.waveform-clip')).toBeTruthy();
    expect(pages[1]?.querySelector('.stacked-waveform__row')).toBeTruthy();
    expect(pages[3]?.childElementCount).toBe(0);
  });

  it('follows a split or merge that re-packs the edited clip onto another page', async () => {
    const {scrollTo, rerender, pageNumber} = setup();

    // Page 1 shows 0-6s; the edited clip at 16.5s lands on page 2 after the
    // re-pack, so page to it.
    expect(pageNumber()).toBe('1 / 6');

    scrollTo.mockClear();

    // Shorter clips re-pack the rows, so that clip now starts page 2. It is
    // still the clip the user edited, so page to it.
    rerender({displayClips: shortClips, activeClip: 11});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(pageNumber()).toBe('2 / 4');
    // The active-clip follow effect's first run after mount uses
    // `behavior: 'auto'` (instant) so scroll-snap-type: x mandatory
    // doesn't interrupt a smooth animation between pages. Mount started
    // with no active clip, so the effect's first real run is this rerender.
    expect(scrollTo).toHaveBeenCalledWith({left: 800, behavior: 'auto'});
  });

  it('does not move when the active clip is already on the visible page', async () => {
    const {scrollTo, rerender, pageNumber, scroller} = setup();

    // Establish page 1 as the visible page (the scroller reports page 1).
    await act(async () => {
      scroller.dispatchEvent(new Event('scroll'));
    });

    scrollTo.mockClear();

    // The selected 3-6s clip is on page 1.
    rerender({displayClips: longClips, activeClip: 1});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(pageNumber()).toBe('1 / 6');
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('stays on the page when its last clip is selected and finishes', () => {
    const {rerender, pageNumber, scroller, onPlayRange} = setup();
    const clips = scroller.querySelectorAll('.waveform-clip');

    fireEvent.keyDown(clips[0]!, {key: 'Enter'});
    expect(onPlayRange).toHaveBeenLastCalledWith(0, 3, 3, expect.any(Function));
    fireEvent.keyDown(clips[1]!, {key: 'Enter'});
    expect(onPlayRange).toHaveBeenLastCalledWith(
      3, 6, 3, expect.any(Function), undefined, true,
    );

    rerender({activeClip: 1, currentTime: 3, playing: true});
    rerender({currentTime: 6, playing: false});
    expect(pageNumber()).toBe('1 / 6');
  });

  it('pages to an active clip that was not on the current page', async () => {
    const {scrollTo, rerender, pageNumber} = setup();

    scrollTo.mockClear();

    // 33s was never on page 1 (0-12s).
    rerender({displayClips: shortClips, activeClip: 22});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(pageNumber()).toBe('4 / 4');
    // First run of the active-clip follow effect after mount: instant
    // (`behavior: 'auto'`) scroll, not smooth, for the snap-settling reason
    // noted above.
    expect(scrollTo).toHaveBeenCalledWith({left: 2400, behavior: 'auto'});
  });
});
