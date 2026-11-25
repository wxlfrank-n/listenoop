// @vitest-environment jsdom

import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {configureStore} from '@reduxjs/toolkit';
import {Provider} from 'react-redux';
import configReducer, {updateConfig} from '../store/configSlice';
import {setIsClipPlaying} from '../store/playerSlice';
import {store} from '../store/store';
import {Settings} from './Settings';

afterEach(cleanup);

const NOTE = 'Changes apply instantly and are saved automatically';

function makeStore() {
  return configureStore({reducer: {config: configReducer}});
}

function renderSettings(settingsStore = makeStore()) {
  return render(
    <Provider store={settingsStore}>
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

describe('Settings playback loop', () => {
  it('offers all five modes and switches between them', () => {
    renderSettings();

    fireEvent.click(screen.getByRole('tab', {name: 'Playback'}));

    const select = screen.getByRole('combobox', {
      name: 'Loop mode',
    }) as HTMLSelectElement;
    expect(select.value).toBe('off');
    expect(Array.from(select.options).map(option => option.text)).toEqual([
      'No loop',
      'Current track',
      'Whole tracklist',
      'Random tracklist',
      'Clips in tracklist',
    ]);
    for (const value of ['track', 'playlist', 'shuffle', 'clips', 'off']) {
      fireEvent.change(select, {target: {value}});
      expect(select.value).toBe(value);
    }
  });
});

it('locks merge scope during clip playback and unlocks it afterward', () => {
  store.dispatch(
    updateConfig({mergeScope: 'clip', showAdvancedControls: true}),
  );
  store.dispatch(setIsClipPlaying(true));
  renderSettings(store);

  fireEvent.click(screen.getByRole('tab', {name: 'Clip detection'}));
  const wholeTrack = screen.getByRole('button', {
    name: 'Whole track',
  }) as HTMLButtonElement;
  expect(wholeTrack.disabled).toBe(true);
  act(() => {
    store.dispatch(updateConfig({mergeScope: 'global'}));
  });
  expect(store.getState().config.mergeScope).toBe('clip');

  act(() => {
    store.dispatch(setIsClipPlaying(false));
  });
  expect(wholeTrack.disabled).toBe(false);
  fireEvent.click(wholeTrack);
  expect(store.getState().config.mergeScope).toBe('global');
});
