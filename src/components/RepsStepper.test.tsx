// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {useState} from 'react';
import {Provider} from 'react-redux';
import {configureStore} from '@reduxjs/toolkit';
import config from '../store/configSlice';
import {RepsStepper} from './RepsStepper';

afterEach(cleanup);
beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
function mount(disabled = false) {
  const changed = vi.fn();
  const store = configureStore({reducer: {config}});
  function Counter() {
    const [value, setValue] = useState(3);
    return (
      <RepsStepper
        value={value}
        disabled={disabled}
        onChange={next => {
          changed(next);
          setValue(next);
        }}
      />
    );
  }
  render(
    <Provider store={store}>
      <Counter />
    </Provider>,
  );
  return {dial: screen.getByRole('slider'), changed};
}
describe('repeat dial', () => {
  it('shows a repeat icon and count without stepper buttons', () => {
    const {dial} = mount();
    expect(dial.querySelector('.clip-reps__value--current')?.textContent).toBe(
      '3',
    );
    expect(dial.querySelector('svg')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('adjusts with arrow keys and clamps at both ends', () => {
    const {dial} = mount();
    fireEvent.keyDown(dial, {key: 'ArrowRight'});
    expect(dial.getAttribute('aria-valuenow')).toBe('4');
    fireEvent.keyDown(dial, {key: 'Home'});
    fireEvent.keyDown(dial, {key: 'ArrowLeft'});
    expect(dial.getAttribute('aria-valuenow')).toBe('1');
    fireEvent.keyDown(dial, {key: 'End'});
    fireEvent.keyDown(dial, {key: 'ArrowUp'});
    expect(dial.getAttribute('aria-valuenow')).toBe('20');
  });
  it('slides right for more and left for fewer from the gesture start', () => {
    const {dial} = mount();
    fireEvent.pointerDown(dial, {
      pointerId: 1,
      isPrimary: true,
      button: 0,
      clientX: 100,
    });
    expect(
      dial.querySelector('.clip-reps__window')?.getAttribute('aria-hidden'),
    ).toBe('true');
    const neighbors = Array.from(
      dial.querySelectorAll<HTMLElement>('.clip-reps__value'),
    )
      .filter(item => item.style.opacity === '0.4')
      .map(item => item.textContent);
    expect(neighbors).toEqual(['2', '4']);
    fireEvent.pointerMove(dial, {pointerId: 1, clientX: 132});
    expect(dial.getAttribute('aria-valuenow')).toBe('5');
    fireEvent.pointerMove(dial, {pointerId: 1, clientX: 84});
    expect(dial.getAttribute('aria-valuenow')).toBe('2');
    fireEvent.pointerUp(dial, {pointerId: 1});
    fireEvent.pointerMove(dial, {pointerId: 1, clientX: 160});
    expect(dial.getAttribute('aria-valuenow')).toBe('2');
  });
  it('stops adjusting after pointer cancellation', () => {
    const {dial, changed} = mount();
    fireEvent.pointerDown(dial, {
      pointerId: 1,
      isPrimary: true,
      button: 0,
      clientX: 100,
    });
    fireEvent.pointerCancel(dial, {pointerId: 1});
    fireEvent.pointerMove(dial, {pointerId: 1, clientX: 132});
    expect(changed).not.toHaveBeenCalled();
  });
  it('does not adjust while disabled', () => {
    const {dial, changed} = mount(true);
    fireEvent.keyDown(dial, {key: 'ArrowRight'});
    fireEvent.pointerDown(dial, {
      pointerId: 1,
      isPrimary: true,
      button: 0,
      clientX: 100,
    });
    fireEvent.pointerMove(dial, {pointerId: 1, clientX: 132});
    expect(changed).not.toHaveBeenCalled();
  });
});
