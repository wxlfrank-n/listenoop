// @vitest-environment jsdom

import {act, fireEvent, render} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {configureStore} from '@reduxjs/toolkit';
import {Provider} from 'react-redux';
import {RowWaveform} from './RowWaveform';
import type {WaveformData} from '../hooks/useWaveform';
import type {Clip as InitClipData} from '../utils/clips';
import {clipGestureLedger, clipPinchState} from './clipPinch';
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

vi.mock('./ClipLabel', async importOriginal => {
  const actual = await importOriginal<typeof import('./ClipLabel')>();
  return {
    ...actual,
    ClipLabel: () => null,
  };
});
vi.mock('./DancingLines', () => ({
  DancingLines: () => null,
}));
vi.mock('./WaveformCursor', () => ({
  WaveformCursor: () => null,
}));
vi.mock('./Waveform', () => ({
  WaveformCanvas: () => <div />,
}));

class FakeResizeObserver {
  constructor() {}
  observe() {}
  disconnect() {}
}

const waveform: WaveformData = {
  data: new Float32Array(12000),
  sampleRate: 100,
  duration: 120,
};

// Three adjacent clips, all inside the first window (600px wide, ~12s).
const clips: InitClipData[] = [
  {start: 1, end: 3, vStart: 1, vEnd: 3},
  {start: 4, end: 6, vStart: 4, vEnd: 6},
  {start: 7, end: 9, vStart: 7, vEnd: 9},
];

function renderRow() {
  const onPinchMergeClip = vi.fn();
  const onPinchSplitClip = vi.fn();
  const onSwipeClip = vi.fn();
  const onActiveClipChange = vi.fn();
  const onPlayRange = vi.fn();
  const setScrolling = vi.fn();

  const tree = (
    overrides: {
      displayClips?: InitClipData[];
      onPinchMergeClip?: typeof onPinchMergeClip;
    } = {},
  ) => (
    <Provider store={makeStore()}>
      <RowWaveform
        waveform={waveform}
        displayClips={overrides.displayClips ?? clips}
        currentTime={0}
        onSeek={vi.fn()}
        onPlayRange={onPlayRange}
        repetitions={3}
        activeClip={-1}
        onActiveClipChange={onActiveClipChange}
        getCurrentTime={() => 0}
        playing={false}
        scrolling={false}
        setScrolling={setScrolling}
        scrollTimeoutRef={{current: undefined}}
        onSwipeClip={onSwipeClip}
        onPinchMergeClip={overrides.onPinchMergeClip ?? onPinchMergeClip}
        onPinchSplitClip={onPinchSplitClip}
      />
    </Provider>
  );

  const view = render(tree());
  const row = view.container.querySelector('.row-waveform') as HTMLDivElement;
  Object.defineProperty(row, 'clientWidth', {value: 600});
  const inner = row.querySelector('.row-waveform__inner') as HTMLElement;
  Object.defineProperty(inner, 'clientWidth', {value: 600});
  // clientWidth is patched post-mount; one extra render lets the width effect
  // settle before the test interacts.
  view.rerender(tree());

  const clipsEls = Array.from(
    view.container.querySelectorAll<HTMLElement>('[data-clip-idx]'),
  ).sort((a, b) => Number(a.dataset.clipIdx) - Number(b.dataset.clipIdx));

  return {
    view,
    tree,
    clipsEls,
    onPinchMergeClip,
    onPinchSplitClip,
    onSwipeClip,
    onActiveClipChange,
    onPlayRange,
    setScrolling,
  };
}

let rafQueue: FrameRequestCallback[] = [];
const flushRaf = () => {
  const q = rafQueue;
  rafQueue = [];
  for (const cb of q) cb(performance.now());
};

const panPx = (track: HTMLElement) => {
  const m = (track.style.transform ?? '').match(/translate3d\((-?[0-9.]+)px/);
  return m ? Number(m[1]) : -1;
};

beforeEach(() => {
  clipGestureLedger.active.clear();
  clipGestureLedger.multi = false;
  clipGestureLedger.clipSwipeLocked = false;
  clipPinchState.active = false;
  (
    globalThis as unknown as {ResizeObserver: typeof ResizeObserver}
  ).ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  rafQueue = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});

describe('RowWaveform clip pinch merge', () => {
  it('merges the clips between two fingers that squeeze together', () => {
    const {clipsEls, onPinchMergeClip} = renderRow();
    const a = clipsEls[0]!;
    const b = clipsEls[2]!;

    fireEvent.pointerDown(a, {
      pointerId: 11,
      pointerType: 'touch',
      clientX: 60,
      clientY: 50,
    });
    fireEvent.pointerDown(b, {
      pointerId: 12,
      pointerType: 'touch',
      clientX: 460,
      clientY: 50,
    });

    act(() => {
      fireEvent.pointerMove(window, {pointerId: 11, clientX: 240, clientY: 50});
      fireEvent.pointerMove(window, {pointerId: 12, clientX: 280, clientY: 50});
    });

    // Release finger A: the two-finger phase ends at distance 40px, down from
    // the 400px it started at.
    fireEvent.pointerUp(window, {pointerId: 11, clientX: 240, clientY: 50});
    fireEvent.pointerUp(window, {pointerId: 12, clientX: 280, clientY: 50});

    expect(onPinchMergeClip).toHaveBeenCalledTimes(1);
    expect(onPinchMergeClip).toHaveBeenCalledWith(0, 2);
  });

  it('does not merge when the fingers move apart', () => {
    const {clipsEls, onPinchMergeClip} = renderRow();

    fireEvent.pointerDown(clipsEls[0]!, {
      pointerId: 21,
      pointerType: 'touch',
      clientX: 60,
      clientY: 50,
    });
    fireEvent.pointerDown(clipsEls[1]!, {
      pointerId: 22,
      pointerType: 'touch',
      clientX: 260,
      clientY: 50,
    });
    act(() => {
      fireEvent.pointerMove(window, {pointerId: 21, clientX: 20, clientY: 50});
      fireEvent.pointerMove(window, {pointerId: 22, clientX: 300, clientY: 50});
    });
    fireEvent.pointerUp(window, {pointerId: 21, clientX: 20, clientY: 50});
    fireEvent.pointerUp(window, {pointerId: 22, clientX: 300, clientY: 50});

    expect(onPinchMergeClip).not.toHaveBeenCalled();
  });

  it('does not pan the viewport while two fingers squeeze clips', () => {
    const {view, clipsEls} = renderRow();
    const track = view.container.querySelector(
      '.row-waveform__track',
    ) as HTMLElement;

    fireEvent.pointerDown(clipsEls[0]!, {
      pointerId: 31,
      pointerType: 'touch',
      clientX: 150,
      clientY: 50,
    });
    fireEvent.pointerDown(clipsEls[1]!, {
      pointerId: 32,
      pointerType: 'touch',
      clientX: 250,
      clientY: 50,
    });
    act(() => {
      fireEvent.pointerMove(window, {pointerId: 31, clientX: 190, clientY: 50});
      fireEvent.pointerMove(window, {pointerId: 32, clientX: 210, clientY: 50});
    });
    fireEvent.pointerUp(window, {pointerId: 31, clientX: 190, clientY: 50});
    fireEvent.pointerUp(window, {pointerId: 32, clientX: 210, clientY: 50});
    act(() => flushRaf());

    // Same 60px+60px horizontal travel would pan ~120px; the pinch must leave
    // the viewport exactly at its resting transform (identity 0px).
    expect(panPx(track)).toBeCloseTo(0);
  });

  it('never activates a clip that took part in a pinch', () => {
    const {clipsEls, onActiveClipChange, onPlayRange} = renderRow();

    fireEvent.pointerDown(clipsEls[0]!, {
      pointerId: 41,
      pointerType: 'touch',
      clientX: 60,
      clientY: 50,
    });
    fireEvent.pointerDown(clipsEls[1]!, {
      pointerId: 42,
      pointerType: 'touch',
      clientX: 260,
      clientY: 50,
    });
    fireEvent.pointerUp(window, {pointerId: 41, clientX: 60, clientY: 50});
    fireEvent.pointerUp(window, {pointerId: 42, clientX: 260, clientY: 50});

    expect(onActiveClipChange).not.toHaveBeenCalled();
    expect(onPlayRange).not.toHaveBeenCalled();
    expect(clipPinchState.active).toBe(false);
  });

  it('still taps a clip normally when only one finger is used', () => {
    const {clipsEls, onActiveClipChange, onPlayRange} = renderRow();

    fireEvent.pointerDown(clipsEls[1]!, {
      pointerId: 51,
      pointerType: 'touch',
      clientX: 100,
      clientY: 50,
    });
    fireEvent.pointerUp(window, {pointerId: 51, clientX: 102, clientY: 52});

    expect(onActiveClipChange).toHaveBeenCalledWith(1);
    expect(onPlayRange).toHaveBeenCalled();
  });

  it('still plays a tap after the merge swaps the clips mid-touch', () => {
    /*
     * Regression: a merged group replaces the pinched clips while the second
     * finger is still down. The unmounted clip never releases its ledger entry,
     * which used to suppress every later tap (click to play/stop went dead).
     */
    const {view, tree, clipsEls, onPinchMergeClip, onActiveClipChange} =
      renderRow();
    const merged: InitClipData = {start: 1, end: 9, vStart: 1, vEnd: 9};

    fireEvent.pointerDown(clipsEls[0]!, {
      pointerId: 81,
      pointerType: 'touch',
      clientX: 60,
      clientY: 50,
    });
    fireEvent.pointerDown(clipsEls[2]!, {
      pointerId: 82,
      pointerType: 'touch',
      clientX: 460,
      clientY: 50,
    });
    act(() => {
      fireEvent.pointerMove(window, {pointerId: 81, clientX: 240, clientY: 50});
      fireEvent.pointerMove(window, {pointerId: 82, clientX: 280, clientY: 50});
    });
    // The first finger lifts, the merge fires, and the parent swaps the clips
    // in while finger 82 is still down -- exactly the ProgressBar flow.
    fireEvent.pointerUp(window, {pointerId: 81, clientX: 240, clientY: 50});
    expect(onPinchMergeClip).toHaveBeenCalledWith(0, 2);
    act(() => view.rerender(tree({displayClips: [merged]})));
    // Second finger lifts with no live window listener left.
    fireEvent.pointerUp(window, {pointerId: 82, clientX: 280, clientY: 50});

    // Neither the ledger nor the pinch state may be stuck.
    expect(clipGestureLedger.multi).toBe(false);
    expect(clipGestureLedger.active.size).toBe(0);
    expect(clipPinchState.active).toBe(false);

    // The freshly merged single clip must still play when tapped.
    const mergedClip = view.container.querySelector(
      '[data-clip-idx="0"]',
    ) as HTMLElement;
    fireEvent.pointerDown(mergedClip, {
      pointerId: 83,
      pointerType: 'touch',
      clientX: 60,
      clientY: 50,
    });
    fireEvent.pointerUp(window, {pointerId: 83, clientX: 62, clientY: 52});
    expect(onActiveClipChange).toHaveBeenCalledWith(0);
  });
});

describe('RowWaveform clip pinch split (anti-snip)', () => {
  it('splits the clip under two fingers that spread apart', () => {
    const {clipsEls, onPinchSplitClip, onPinchMergeClip} = renderRow();
    const clip = clipsEls[1]!;

    fireEvent.pointerDown(clip, {
      pointerId: 101,
      pointerType: 'touch',
      clientX: 240,
      clientY: 40,
    });
    fireEvent.pointerDown(clip, {
      pointerId: 102,
      pointerType: 'touch',
      clientX: 280,
      clientY: 40,
    });

    // Spread from 40px to 240px before either finger lifts.
    act(() => {
      fireEvent.pointerMove(window, {
        pointerId: 101,
        clientX: 160,
        clientY: 40,
      });
      fireEvent.pointerMove(window, {
        pointerId: 102,
        clientX: 400,
        clientY: 40,
      });
    });

    fireEvent.pointerUp(window, {pointerId: 101, clientX: 160, clientY: 40});
    fireEvent.pointerUp(window, {pointerId: 102, clientX: 400, clientY: 40});

    expect(onPinchSplitClip).toHaveBeenCalledTimes(1);
    expect(onPinchSplitClip).toHaveBeenCalledWith(1);
    expect(onPinchMergeClip).not.toHaveBeenCalled();
  });

  it('does not split when two fingers on one clip squeeze together', () => {
    const {clipsEls, onPinchSplitClip, onPinchMergeClip} = renderRow();
    const clip = clipsEls[1]!;

    fireEvent.pointerDown(clip, {
      pointerId: 111,
      pointerType: 'touch',
      clientX: 160,
      clientY: 40,
    });
    fireEvent.pointerDown(clip, {
      pointerId: 112,
      pointerType: 'touch',
      clientX: 400,
      clientY: 40,
    });
    act(() => {
      fireEvent.pointerMove(window, {
        pointerId: 111,
        clientX: 240,
        clientY: 40,
      });
      fireEvent.pointerMove(window, {
        pointerId: 112,
        clientX: 280,
        clientY: 40,
      });
    });
    fireEvent.pointerUp(window, {pointerId: 111, clientX: 240, clientY: 40});
    fireEvent.pointerUp(window, {pointerId: 112, clientX: 280, clientY: 40});

    expect(onPinchSplitClip).not.toHaveBeenCalled();
    expect(onPinchMergeClip).not.toHaveBeenCalled();
  });

  it('does not pan the viewport while two fingers spread on one clip', () => {
    const {view, clipsEls} = renderRow();
    const track = view.container.querySelector(
      '.row-waveform__track',
    ) as HTMLElement;
    const clip = clipsEls[1]!;

    fireEvent.pointerDown(clip, {
      pointerId: 121,
      pointerType: 'touch',
      clientX: 240,
      clientY: 40,
    });
    fireEvent.pointerDown(clip, {
      pointerId: 122,
      pointerType: 'touch',
      clientX: 280,
      clientY: 40,
    });
    act(() => {
      fireEvent.pointerMove(window, {
        pointerId: 121,
        clientX: 160,
        clientY: 40,
      });
      fireEvent.pointerMove(window, {
        pointerId: 122,
        clientX: 400,
        clientY: 40,
      });
    });
    fireEvent.pointerUp(window, {pointerId: 121, clientX: 160, clientY: 40});
    fireEvent.pointerUp(window, {pointerId: 122, clientX: 400, clientY: 40});
    act(() => flushRaf());

    expect(panPx(track)).toBeCloseTo(0);
  });

  it('does not split when the two fingers land on different clips', () => {
    const {clipsEls, onPinchSplitClip} = renderRow();

    fireEvent.pointerDown(clipsEls[0]!, {
      pointerId: 131,
      pointerType: 'touch',
      clientX: 100,
      clientY: 40,
    });
    fireEvent.pointerDown(clipsEls[1]!, {
      pointerId: 132,
      pointerType: 'touch',
      clientX: 140,
      clientY: 40,
    });
    act(() => {
      fireEvent.pointerMove(window, {pointerId: 131, clientX: 60, clientY: 40});
      fireEvent.pointerMove(window, {
        pointerId: 132,
        clientX: 300,
        clientY: 40,
      });
    });
    fireEvent.pointerUp(window, {pointerId: 131, clientX: 60, clientY: 40});
    fireEvent.pointerUp(window, {pointerId: 132, clientX: 300, clientY: 40});

    expect(onPinchSplitClip).not.toHaveBeenCalled();
  });
});

describe('RowWaveform clip swipe scroll lock', () => {
  /*
   * A single virtually merged clip whose up-split produces two pieces, so an
   * 'up' swipe has a real gesture to latch.
   */
  const merged: InitClipData = {
    start: 1,
    end: 9,
    vStart: 1,
    vEnd: 9,
    children: [
      {start: 1, end: 3, vStart: 1, vEnd: 3},
      {start: 4, end: 6, vStart: 4, vEnd: 6},
      {start: 7, end: 9, vStart: 7, vEnd: 9},
    ],
  };

  it('latches the gesture to the clip so the waveform cannot pan', () => {
    const {view, tree, setScrolling, onSwipeClip} = renderRow();

    view.rerender(
      tree({
        displayClips: [merged],
      }),
    );

    fireEvent.pointerDown(
      view.container.querySelector('[data-clip-idx="0"]') as HTMLElement,
      {
        pointerId: 203,
        pointerType: 'touch',
        clientX: 100,
        clientY: 40,
      },
    );
    act(() => {
      fireEvent.pointerMove(window, {pointerId: 203, clientX: 100, clientY: 0});
    });

    // The clip decided this is a swipe: it owns the gesture now, so the
    // waveform's horizontal pan must stand down even if the finger drifts.
    expect(clipGestureLedger.clipSwipeLocked).toBe(true);

    // A mostly-horizontal move that would normally pan must not engage it.
    act(() => {
      fireEvent.pointerMove(window, {
        pointerId: 203,
        clientX: 260,
        clientY: 0,
      });
    });

    expect(setScrolling).not.toHaveBeenCalled();

    // Releasing on the original vertical line still commits the split and
    // unlocks the ledger.
    fireEvent.pointerUp(window, {pointerId: 203, clientX: 100, clientY: -20});

    expect(onSwipeClip).toHaveBeenCalledWith(0, 'up');
    expect(clipGestureLedger.clipSwipeLocked).toBe(false);
  });

  it('leaves horizontal navigation alone when no clip gesture latched', () => {
    const {view, tree, setScrolling, onSwipeClip} = renderRow();

    view.rerender(
      tree({
        displayClips: [merged],
      }),
    );

    fireEvent.pointerDown(
      view.container.querySelector('[data-clip-idx="0"]') as HTMLElement,
      {
        pointerId: 204,
        pointerType: 'touch',
        clientX: 100,
        clientY: 40,
      },
    );

    // Back-and-forth horizontal move, well within 15 degrees of horizontal:
    // never a clip swipe, so the waveform pans as before.
    act(() => {
      fireEvent.pointerMove(window, {
        pointerId: 204,
        clientX: 260,
        clientY: 42,
      });
    });

    expect(clipGestureLedger.clipSwipeLocked).toBe(false);
    expect(setScrolling).toHaveBeenCalled();
    expect(onSwipeClip).not.toHaveBeenCalled();

    fireEvent.pointerUp(window, {pointerId: 204, clientX: 260, clientY: 42});
  });
});
