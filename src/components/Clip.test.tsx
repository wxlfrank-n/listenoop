// @vitest-environment jsdom

import {cleanup, fireEvent, render} from '@testing-library/react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {Clip} from './Clip';
import {clipGestureLedger, clipPinchState} from './clipPinch';
import type {WaveWindow} from '../types';
import type {Clip as InitClipData} from '../utils/clips';

const windowConfig: WaveWindow = {
  windowStartSec: 0,
  windowLen: 10,
  innerH: 192,
  vbW: 1000,
  vbH: 200,
};

const clip: InitClipData = {
  start: 1,
  end: 3,
  vStart: 1,
  vEnd: 3,
};

const renderClip = (
  overrides: Partial<React.ComponentProps<typeof Clip>> = {},
) => {
  const props: React.ComponentProps<typeof Clip> = {
    clip,
    window: windowConfig,
    id: 0,
    active: false,
    onPlayRange: vi.fn(),
    repetitions: 3,
    playing: false,
    onStopPlayback: vi.fn(),
    onActivate: vi.fn(),
    onSwipe: vi.fn(),
    ...overrides,
  };
  const view = render(<Clip {...props} />);
  return {
    ...view,
    rect: view.container.querySelector('.waveform-clip')!,
    props,
  };
};

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
});

beforeEach(() => {
  clipGestureLedger.active.clear();
  clipGestureLedger.multi = false;
  clipGestureLedger.clipSwipeLocked = false;
  clipPinchState.active = false;
});

/*
 * The swipe action icon is portalled into <body>, which RTL does not tear down
 * on its own here (no global auto-cleanup), so reset between tests.
 */
afterEach(() => {
  cleanup();
});

describe('Clip gestures', () => {
  it('plays on a tap without requiring a second click', () => {
    const {rect, props} = renderClip();

    fireEvent.pointerDown(rect, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerUp(rect, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 102,
      clientY: 102,
    });

    expect(props.onActivate).toHaveBeenCalledWith(0);
    expect(props.onPlayRange).toHaveBeenCalledWith(1, 3, 3);
  });

  it('stops playback when the active clip is tapped again', () => {
    const onStopPlayback = vi.fn();
    const onPlayRange = vi.fn();
    const {rect} = renderClip({
      playing: true,
      active: true,
      onStopPlayback,
      onPlayRange,
    });

    fireEvent.click(rect);

    expect(onStopPlayback).toHaveBeenCalledTimes(1);
    expect(onPlayRange).not.toHaveBeenCalled();
  });

  it('reports a swipe up without playing the clip', () => {
    const onSwipe = vi.fn();
    const onPlayRange = vi.fn();
    const {rect} = renderClip({onSwipe, onPlayRange});

    fireEvent.pointerDown(rect, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerUp(rect, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 100,
      clientY: 60,
    });

    expect(onSwipe).toHaveBeenCalledWith(0, 'up');
    expect(onPlayRange).not.toHaveBeenCalled();
  });

  it('reports a swipe down with the reported id', () => {
    const onSwipe = vi.fn();
    const onPlayRange = vi.fn();
    const {rect} = renderClip({id: 7, onSwipe, onPlayRange});

    fireEvent.pointerDown(rect, {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerUp(rect, {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 100,
      clientY: 140,
    });

    expect(onSwipe).toHaveBeenCalledWith(7, 'down');
    expect(onPlayRange).not.toHaveBeenCalled();
  });

  it('reports a down-right diagonal swipe (merge right)', () => {
    const onSwipe = vi.fn();
    const onPlayRange = vi.fn();
    const {rect} = renderClip({onSwipe, onPlayRange});

    // 45 degrees below the horizontal: dx=30, dy=30.
    fireEvent.pointerDown(rect, {
      pointerId: 4,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerUp(rect, {
      pointerId: 4,
      pointerType: 'touch',
      clientX: 130,
      clientY: 130,
    });

    expect(onSwipe).toHaveBeenCalledWith(0, 'down-right');
    expect(onPlayRange).not.toHaveBeenCalled();
  });

  it('reports an up-right diagonal swipe (split rightmost)', () => {
    const onSwipe = vi.fn();
    const {rect} = renderClip({onSwipe});

    // 45 degrees above the horizontal: dx=30, dy=-30.
    fireEvent.pointerDown(rect, {
      pointerId: 5,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerUp(rect, {
      pointerId: 5,
      pointerType: 'touch',
      clientX: 130,
      clientY: 70,
    });

    expect(onSwipe).toHaveBeenCalledWith(0, 'up-right');
  });

  it('classifies diagonal swipes by band: 15..75 deg is diagonal, steeper vertical, shallower horizontal', () => {
    const onSwipe = vi.fn();
    const {rect} = renderClip({onSwipe});
    const swipe = (id: number, dx: number, dy: number) => {
      fireEvent.pointerDown(rect, {
        pointerId: id,
        pointerType: 'touch',
        clientX: 100,
        clientY: 100,
      });
      fireEvent.pointerUp(rect, {
        pointerId: id,
        pointerType: 'touch',
        clientX: 100 + dx,
        clientY: 100 + dy,
      });
    };

    // 45 deg (ratio 1.0, in band) -> down-right.
    swipe(6, 40, 40);
    expect(onSwipe).toHaveBeenLastCalledWith(0, 'down-right');

    // 36 deg (ratio 0.73, in band) -> down-right.
    swipe(7, 60, 43);
    expect(onSwipe).toHaveBeenLastCalledWith(0, 'down-right');

    // 70 deg (ratio 2.75, in band) -> down-right.
    swipe(8, 20, 55);
    expect(onSwipe).toHaveBeenLastCalledWith(0, 'down-right');

    // 80 deg (ratio 5.67, above the band) -> plain vertical down.
    swipe(9, 10, 57);
    expect(onSwipe).toHaveBeenLastCalledWith(0, 'down');

    // 10 deg (ratio 0.18, below the band) -> horizontal, no clip gesture.
    swipe(10, 80, 14);
    expect(onSwipe).toHaveBeenCalledTimes(4);
  });

  it('reports an up-left diagonal swipe (split leftmost)', () => {
    const onSwipe = vi.fn();
    const {rect} = renderClip({onSwipe});

    // 45 degrees above the horizontal: dx=-30, dy=-30.
    fireEvent.pointerDown(rect, {
      pointerId: 11,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerUp(rect, {
      pointerId: 11,
      pointerType: 'touch',
      clientX: 70,
      clientY: 70,
    });

    expect(onSwipe).toHaveBeenCalledWith(0, 'up-left');
  });

  it('classifies down-left diagonal swipes by band', () => {
    const onSwipe = vi.fn();
    const {rect} = renderClip({onSwipe});
    const swipe = (id: number, dx: number, dy: number) => {
      fireEvent.pointerDown(rect, {
        pointerId: id,
        pointerType: 'touch',
        clientX: 100,
        clientY: 100,
      });
      fireEvent.pointerUp(rect, {
        pointerId: id,
        pointerType: 'touch',
        clientX: 100 + dx,
        clientY: 100 + dy,
      });
    };

    // 45 deg (ratio 1.0, in band) -> down-left.
    swipe(13, -30, 30);
    expect(onSwipe).toHaveBeenLastCalledWith(0, 'down-left');

    // 70 deg (ratio 2.75, in band) -> down-left.
    swipe(14, -20, 55);
    expect(onSwipe).toHaveBeenLastCalledWith(0, 'down-left');

    // 80 deg (ratio 5.67, above the band) -> plain vertical down (merge).
    swipe(15, -10, 57);
    expect(onSwipe).toHaveBeenLastCalledWith(0, 'down');

    // 10 deg (ratio 0.18, below the band) -> horizontal, no clip gesture.
    swipe(16, -80, 14);
    expect(onSwipe).toHaveBeenCalledTimes(3);
  });

  it('classifies up-left diagonals by band and keeps steep ones vertical', () => {
    const onSwipe = vi.fn();
    const {rect} = renderClip({onSwipe});
    const swipe = (id: number, dx: number, dy: number) => {
      fireEvent.pointerDown(rect, {
        pointerId: id,
        pointerType: 'touch',
        clientX: 100,
        clientY: 100,
      });
      fireEvent.pointerUp(rect, {
        pointerId: id,
        pointerType: 'touch',
        clientX: 100 + dx,
        clientY: 100 + dy,
      });
    };

    // 36 deg (ratio 0.73, in band) -> up-left.
    swipe(20, -60, -43);
    expect(onSwipe).toHaveBeenLastCalledWith(0, 'up-left');

    // 70 deg (ratio 2.75, in band) -> up-left.
    swipe(21, -20, -55);
    expect(onSwipe).toHaveBeenLastCalledWith(0, 'up-left');

    // 80 deg (ratio 5.67, above the band) -> plain vertical up.
    swipe(22, -10, -57);
    expect(onSwipe).toHaveBeenLastCalledWith(0, 'up');

    // 10 deg (ratio 0.18, below the band, absY < absX) -> horizontal, no clip
    // gesture.
    swipe(23, -80, -14);
    expect(onSwipe).toHaveBeenCalledTimes(3);
  });

  it('shows the split icon while dragging up and hides it on release', () => {
    const {rect} = renderClip();

    fireEvent.pointerDown(rect, {
      pointerId: 30,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(window, {
      pointerId: 30,
      pointerType: 'touch',
      clientX: 100,
      clientY: 60,
    });

    const swiping = rect;
    expect(swiping.classList.contains('waveform-clip--swiping')).toBe(true);

    const hint = document.body.querySelector(
      '.waveform-clip__swipe-hint',
    ) as HTMLElement;
    expect(hint?.textContent).toContain('✂');
    // The icon is portalled to the finger, so it clears the hand.
    expect(hint.style.left).toBe('100px');
    expect(hint.style.top).toBe('60px');

    fireEvent.pointerUp(window, {
      pointerId: 30,
      pointerType: 'touch',
      clientX: 100,
      clientY: 60,
    });

    expect(swiping.classList.contains('waveform-clip--swiping')).toBe(false);
    expect(
      document.body.querySelector('.waveform-clip__swipe-hint'),
    ).toBeNull();
  });

  it('shows the merge icon while dragging down', () => {
    const {rect} = renderClip();

    fireEvent.pointerDown(rect, {
      pointerId: 31,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(window, {
      pointerId: 31,
      pointerType: 'touch',
      clientX: 100,
      clientY: 160,
    });

    expect(
      document.body.querySelector('.waveform-clip__swipe-hint')?.textContent,
    ).toContain('🔗');
  });

  it('shows no split icon while dragging up on an unsplittable clip', () => {
    const {rect} = renderClip({canSplit: false});

    fireEvent.pointerDown(rect, {
      pointerId: 34,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(window, {
      pointerId: 34,
      pointerType: 'touch',
      clientX: 100,
      clientY: 60,
    });

    expect(
      document.body.querySelector('.waveform-clip__swipe-hint'),
    ).toBeNull();
    expect(rect.classList.contains('waveform-clip--swiping')).toBe(false);
  });

  it('still shows the merge icon while dragging down on an unsplittable clip', () => {
    const {rect} = renderClip({canSplit: false});

    fireEvent.pointerDown(rect, {
      pointerId: 35,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(window, {
      pointerId: 35,
      pointerType: 'touch',
      clientX: 100,
      clientY: 160,
    });

    expect(
      document.body.querySelector('.waveform-clip__swipe-hint')?.textContent,
    ).toContain('🔗');
  });

  it('shows no swipe icon for a horizontal drag (parent owns it)', () => {
    const {rect} = renderClip();

    fireEvent.pointerDown(rect, {
      pointerId: 32,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(window, {
      pointerId: 32,
      pointerType: 'touch',
      clientX: 180,
      clientY: 114,
    });

    expect(
      document.body.querySelector('.waveform-clip__swipe-hint'),
    ).toBeNull();
  });

  it('shows the split affordance on an active, splittable clip', () => {
    const {rect} = renderClip({active: true, canSplit: true});

    const hint = rect.querySelector('.waveform-clip__split-hint');

    expect(hint).not.toBeNull();
    expect(hint?.textContent).toContain('✂');
  });

  it('shows no split affordance on an active, unsplittable clip', () => {
    const {rect} = renderClip({active: true, canSplit: false});

    expect(rect.querySelector('.waveform-clip__split-hint')).toBeNull();
  });

  it('hides the split affordance when the clip is not active', () => {
    const {rect} = renderClip({active: false});

    expect(rect.querySelector('.waveform-clip__split-hint')).toBeNull();
  });

  it('marks the clip rectangle active and renders its label', () => {
    const label = <span className="clip-label-marker">x</span>;
    const {container} = renderClip({id: 3, active: true, label});

    const rect = container.querySelector('.waveform-clip') as HTMLElement;
    expect(rect.classList.contains('waveform-clip--active')).toBe(true);
    expect(container.querySelector('.clip-label-marker')).not.toBeNull();
  });

  it('suppresses taps when two clips are pressed at once', () => {
    const onActivateA = vi.fn();
    const onActivateB = vi.fn();
    const onSwipeA = vi.fn();
    const onSwipeB = vi.fn();
    const view = render(
      <>
        <Clip
          clip={clip}
          window={windowConfig}
          id={0}
          active={false}
          onPlayRange={vi.fn()}
          repetitions={3}
          playing={false}
          onStopPlayback={vi.fn()}
          onActivate={onActivateA}
          onSwipe={onSwipeA}
        />
        <Clip
          clip={clip}
          window={windowConfig}
          id={1}
          active={false}
          onPlayRange={vi.fn()}
          repetitions={3}
          playing={false}
          onStopPlayback={vi.fn()}
          onActivate={onActivateB}
          onSwipe={onSwipeB}
        />
      </>,
    );
    const rects = view.container.querySelectorAll('.waveform-clip');
    const a = rects[0]!;
    const b = rects[1]!;

    fireEvent.pointerDown(a, {
      pointerId: 61,
      pointerType: 'touch',
      clientX: 100,
      clientY: 80,
    });
    fireEvent.pointerDown(b, {
      pointerId: 62,
      pointerType: 'touch',
      clientX: 100,
      clientY: 80,
    });
    // Neither finger moves; without the ledger this would be two clean taps.
    fireEvent.pointerUp(window, {pointerId: 61, clientX: 100, clientY: 80});
    fireEvent.pointerUp(window, {pointerId: 62, clientX: 100, clientY: 80});

    expect(onActivateA).not.toHaveBeenCalled();
    expect(onActivateB).not.toHaveBeenCalled();
    expect(onSwipeA).not.toHaveBeenCalled();
    expect(onSwipeB).not.toHaveBeenCalled();

    // The ledger must return to a clean state so the next solo tap works.
    expect(clipGestureLedger.multi).toBe(false);
    expect(clipGestureLedger.active.size).toBe(0);

    fireEvent.pointerDown(a, {
      pointerId: 63,
      pointerType: 'touch',
      clientX: 100,
      clientY: 80,
    });
    fireEvent.pointerUp(window, {pointerId: 63, clientX: 101, clientY: 81});
    expect(onActivateA).toHaveBeenCalledWith(0);
  });

  it('does not leave the ledger stuck when a clip unmounts mid-touch', () => {
    /*
     * Regression: a pinch merge replaces DisplayClips and unmounts the pinched
     * Clips while the second finger is still down. That clip's `last` never
     * runs, so its pointerId would stay in the ledger forever and `multi`
     * would suppress every later tap (play/stop dead).
     */
    const onActivateA = vi.fn();
    const onActivateB = vi.fn();
    const view = render(
      <>
        <Clip
          clip={clip}
          window={windowConfig}
          id={0}
          active={false}
          onPlayRange={vi.fn()}
          repetitions={3}
          playing={false}
          onStopPlayback={vi.fn()}
          onActivate={onActivateA}
          onSwipe={vi.fn()}
        />
        <Clip
          clip={clip}
          window={windowConfig}
          id={1}
          active={false}
          onPlayRange={vi.fn()}
          repetitions={3}
          playing={false}
          onStopPlayback={vi.fn()}
          onActivate={onActivateB}
          onSwipe={vi.fn()}
        />
      </>,
    );
    const rects = view.container.querySelectorAll('.waveform-clip');

    fireEvent.pointerDown(rects[0]!, {
      pointerId: 71,
      pointerType: 'touch',
      clientX: 100,
      clientY: 80,
    });
    fireEvent.pointerDown(rects[1]!, {
      pointerId: 72,
      pointerType: 'touch',
      clientX: 100,
      clientY: 80,
    });
    // Only the first finger lifts; the other would be lifted after the clips
    // are replaced by the merge.
    fireEvent.pointerUp(window, {pointerId: 71, clientX: 100, clientY: 80});
    view.unmount();

    expect(clipGestureLedger.multi).toBe(false);
    expect(clipGestureLedger.active.size).toBe(0);

    // A fresh tap afterwards must play the clip again.
    const fresh = renderClip();
    fireEvent.pointerDown(fresh.rect, {
      pointerId: 73,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerUp(window, {pointerId: 73, clientX: 101, clientY: 101});
    expect(fresh.props.onActivate).toHaveBeenCalledWith(0);
    expect(fresh.props.onPlayRange).toHaveBeenCalledWith(1, 3, 3);
  });
});
