// @vitest-environment jsdom

import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  addListener,
  addListeners,
  isOutside,
  onOutsideDismiss,
} from './listener';

afterEach(() => {
  document.body.innerHTML = '';
});

/** Dispatches on `node` and hands back the event, which only has a target once dispatched. */
function captureEvent(node: Element, type: string): Event {
  const events: Event[] = [];
  node.addEventListener(type, event => events.push(event), {once: true});
  node.dispatchEvent(new Event(type, {bubbles: true}));
  const ev = events[0];
  if (!ev) throw new Error('expected event to be captured');
  return ev;
}

describe('addListener', () => {
  it('registers the handler and removes it on cleanup', () => {
    const handler = vi.fn();
    const target = document.createElement('button');

    const remove = addListener(target, 'click', handler);
    target.dispatchEvent(new Event('click'));
    expect(handler).toHaveBeenCalledTimes(1);

    remove();
    target.dispatchEvent(new Event('click'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores a missing target and still returns a cleanup', () => {
    const remove = addListener(null, 'click', vi.fn());
    expect(() => remove()).not.toThrow();
  });

  it('removes a capturing listener', () => {
    const handler = vi.fn();
    const outer = document.createElement('div');
    const child = document.createElement('div');
    outer.append(child);
    document.body.append(outer);

    const remove = addListener(outer, 'click', handler, true);
    child.dispatchEvent(new Event('click', {bubbles: true}));
    expect(handler).toHaveBeenCalledTimes(1);

    remove();
    child.dispatchEvent(new Event('click', {bubbles: true}));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('addListeners', () => {
  it('removes every registered listener', () => {
    const onPlay = vi.fn();
    const onPause = vi.fn();
    const audio = document.createElement('audio');

    const remove = addListeners(audio, [
      ['play', onPlay],
      ['pause', onPause, {passive: true}],
    ]);

    audio.dispatchEvent(new Event('play'));
    expect(onPlay).toHaveBeenCalledTimes(1);

    remove();
    audio.dispatchEvent(new Event('play'));
    audio.dispatchEvent(new Event('pause'));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPause).not.toHaveBeenCalled();
  });
});

describe('isOutside', () => {
  it('is false for the container itself and its descendants', () => {
    const container = document.createElement('div');
    const child = document.createElement('span');
    container.append(child);
    document.body.append(container);
    const event = captureEvent(child, 'pointerdown');

    expect(isOutside(container, event)).toBe(false);
  });

  it('is true for a node elsewhere in the document', () => {
    const container = document.createElement('div');
    const other = document.createElement('div');
    document.body.append(container, other);
    const event = captureEvent(other, 'pointerdown');

    expect(isOutside(container, event)).toBe(true);
  });

  it('treats a missing container as outside', () => {
    const node = document.createElement('div');
    document.body.append(node);
    const event = captureEvent(node, 'pointerdown');

    expect(isOutside(null, event)).toBe(true);
  });
});

describe('onOutsideDismiss', () => {
  it('dismisses on an outside pointer press only', () => {
    const container = document.createElement('div');
    const inner = document.createElement('button');
    const outside = document.createElement('button');
    container.append(inner);
    document.body.append(container, outside);
    const onDismiss = vi.fn();
    const remove = onOutsideDismiss(container, onDismiss);

    inner.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
    expect(onDismiss).not.toHaveBeenCalled();

    outside.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    remove();
    outside.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
