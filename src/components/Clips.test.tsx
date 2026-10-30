// @vitest-environment jsdom

import {fireEvent, render} from '@testing-library/react';
import {beforeAll, describe, expect, it, vi} from 'vitest';
import {Clips} from './Clips';
import type {WaveWindow} from '../types';
import type {Clip as InitClipData} from '../utils/clips';

const windowConfig: WaveWindow = {
  windowStartSec: 0,
  windowLen: 10,
  innerH: 192,
  vbW: 1000,
  vbH: 200,
};

const renderClips = (
  overrides: Partial<React.ComponentProps<typeof Clips>> = {},
) => {
  const props: React.ComponentProps<typeof Clips> = {
    clips: [],
    window: windowConfig,
    onPlayRange: vi.fn(),
    repetitions: 3,
    playing: false,
    onStopPlayback: vi.fn(),
    activeClip: -1,
    onActivate: vi.fn(),
    onSwipe: vi.fn(),
    ...overrides,
  };
  const view = render(<Clips {...props} />);
  return {...view, props};
};

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
});

describe('Clips list', () => {
  it('renders only clips intersecting the window, preserving array indices', () => {
    const clips: InitClipData[] = [
      {start: 1, end: 3, vStart: 1, vEnd: 3},
      {start: 50, end: 52, vStart: 50, vEnd: 52},
      {start: 4, end: 6, vStart: 4, vEnd: 6},
    ];
    const getIdx = vi.fn((c: InitClipData, i: number) =>
      c.start === 4 ? 42 : i,
    );
    const renderLabel = vi.fn((id: number) => <span data-label={id}>l</span>);
    const {container} = renderClips({clips, getIdx, renderLabel});

    const rects = container.querySelectorAll('.waveform-clip');
    // Clips at array indices 0 and 2 are visible; index 1 is outside the window.
    expect(rects).toHaveLength(2);
    expect((rects[0] as HTMLElement).style.left).toBe('10%');
    expect((rects[0] as HTMLElement).style.width).toBe('20%');
    // getIdx/renderLabel run only for visible clips, with original positions.
    expect(getIdx).toHaveBeenCalledWith(clips[0], 0);
    expect(getIdx).toHaveBeenCalledWith(clips[2], 2);
    expect(getIdx).toHaveBeenCalledTimes(2);
    expect(renderLabel).toHaveBeenCalledWith(42, clips[2], 2);
    expect(container.querySelector('[data-label="42"]')).not.toBeNull();
  });

  it('plays a different visible clip while another is playing', () => {
    const onStopPlayback = vi.fn();
    const onPlayRange = vi.fn();
    const onActivate = vi.fn();
    const clipA: InitClipData = {start: 1, end: 3, vStart: 1, vEnd: 3};
    const clipB: InitClipData = {start: 4, end: 6, vStart: 4, vEnd: 6};
    const {container} = renderClips({
      clips: [clipA, clipB],
      playing: true,
      activeClip: 0,
      onStopPlayback,
      onPlayRange,
      onActivate,
    });

    fireEvent.click(container.querySelectorAll('.waveform-clip')[1]!);

    expect(onStopPlayback).not.toHaveBeenCalled();
    expect(onActivate).toHaveBeenCalledWith(1);
    expect(onPlayRange).toHaveBeenCalledWith(4, 6, 3);
  });

  it('stops playback when the active clip itself is clicked', () => {
    const onStopPlayback = vi.fn();
    const onPlayRange = vi.fn();
    const clipA: InitClipData = {start: 1, end: 3, vStart: 1, vEnd: 3};
    const {container} = renderClips({
      clips: [clipA],
      playing: true,
      activeClip: 0,
      onStopPlayback,
      onPlayRange,
    });

    fireEvent.click(container.querySelector('.waveform-clip')!);

    expect(onStopPlayback).toHaveBeenCalledTimes(1);
    expect(onPlayRange).not.toHaveBeenCalled();
  });

  it('shows the split affordance only for an active splittable clip', () => {
    const merged: InitClipData = {
      start: 1,
      end: 5,
      vStart: 1,
      vEnd: 5,
      children: [
        {start: 1, end: 2, vStart: 1, vEnd: 2},
        {start: 3, end: 5, vStart: 3, vEnd: 5},
      ],
    };
    const single: InitClipData = {start: 6, end: 8, vStart: 6, vEnd: 8};

    const hasSplitHint = (container: HTMLElement) =>
      container.querySelector('.waveform-clip__split-hint') !== null;

    const mergedView = renderClips({
      clips: [merged, single],
      activeClip: 0,
    });

    // The active merged clip has a boundary, so it shows the affordance.
    expect(hasSplitHint(mergedView.container)).toBe(true);

    const singleView = renderClips({
      clips: [merged, single],
      activeClip: 1,
    });

    // The active single clip has no boundary, so no affordance is shown.
    expect(hasSplitHint(singleView.container)).toBe(false);
  });
});
