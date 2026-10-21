// @vitest-environment jsdom

import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {configureStore} from '@reduxjs/toolkit';
import {Provider} from 'react-redux';
import configReducer from '../store/configSlice';
import {Settings} from './Settings';

afterEach(cleanup);

const NOTE = 'Changes apply instantly and are saved automatically';

function makeStore() {
  return configureStore({reducer: {config: configReducer}});
}

function renderSettings() {
  return render(
    <Provider store={makeStore()}>
      <Settings onClose={() => {}} />
    </Provider>,
  );
}

describe('Settings footer', () => {
  it('keeps the autosave note behind the info toggle', () => {
    const {container} = renderSettings();
    expect(container.querySelector('.settings-footer-note')).toBeNull();
    expect(screen.queryByText(NOTE)).toBeNull();

    fireEvent.click(screen.getByRole('button', {name: NOTE}));
    expect(screen.getByText(NOTE)).not.toBeNull();
  });

  it('toggles the note off with a second press', () => {
    renderSettings();
    const toggle = screen.getByRole('button', {name: NOTE});
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it('closes the note on Escape and on an outside press', () => {
    const {container} = renderSettings();
    const toggle = screen.getByRole('button', {name: NOTE});

    fireEvent.click(toggle);
    fireEvent.keyDown(document, {key: 'Escape'});
    expect(screen.queryByText(NOTE)).toBeNull();

    fireEvent.click(toggle);
    fireEvent.pointerDown(container.querySelector('.settings-body')!);
    expect(screen.queryByText(NOTE)).toBeNull();
  });
});
