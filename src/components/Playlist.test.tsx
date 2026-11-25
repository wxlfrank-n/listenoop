// @vitest-environment jsdom

import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {Provider} from 'react-redux';
import {afterEach, expect, it, vi} from 'vitest';
import {store} from '../store/store';
import {Playlist} from './Playlist';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('filters playlists and offers the inline action for the typed name', () => {
  const onSwitchPlaylist = vi.fn();
  const onCreatePlaylist = vi.fn();
  const onRemovePlaylist = vi.fn();
  const onRenamePlaylist = vi.fn();
  const onAddFiles = vi.fn();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(
    <Provider store={store}>
      <Playlist
        playlistNames={['', 'Listening', 'Review']}
        activePlaylist=""
        onSwitchPlaylist={onSwitchPlaylist}
        onCreatePlaylist={onCreatePlaylist}
        onRenamePlaylist={onRenamePlaylist}
        onRemovePlaylist={onRemovePlaylist}
        onSelectTrack={vi.fn()}
        onRemoveTrack={vi.fn()}
        onAddFiles={onAddFiles}
        onClose={vi.fn()}
      />
    </Provider>,
  );

  function enterManagement() {
    fireEvent.doubleClick(
      screen
        .getByText('Default', {selector: '.playlist-picker__browse b'})
        .closest('button')!,
    );
    return screen.getByRole('textbox', {name: 'Choose playlist'});
  }
  expect(screen.queryByRole('button', {name: 'Remove playlist'})).toBeNull();
  expect(screen.getByRole('button', {name: /01A/})).toBeTruthy();
  expect(screen.queryByRole('button', {name: 'Remove track'})).toBeNull();
  expect(screen.queryByRole('button', {name: 'Listening'})).toBeNull();
  const dropdown = screen.getByRole('button', {name: 'Choose playlist'});
  fireEvent.click(dropdown);
  expect(screen.getByRole('button', {name: 'Review'})).toBeTruthy();
  expect(screen.queryByRole('textbox')).toBeNull();
  const input = enterManagement();
  fireEvent.change(input, {target: {value: 'list'}});
  expect(screen.queryByRole('button', {name: 'Review'})).toBeNull();
  fireEvent.click(screen.getByRole('button', {name: 'New playlist'}));
  expect(onCreatePlaylist).toHaveBeenCalledWith('list');
  fireEvent.change(enterManagement(), {target: {value: 'list'}});
  fireEvent.click(screen.getByRole('button', {name: 'Listening'}));
  expect(onSwitchPlaylist).toHaveBeenCalledWith('Listening');
  expect(screen.queryByRole('textbox')).toBeNull();

  fireEvent.change(enterManagement(), {target: {value: 'Listening'}});
  fireEvent.click(screen.getByRole('button', {name: 'Rename Listening'}));
  const edit = screen.getByRole('textbox', {name: 'Playlist name'});
  expect(edit.closest('.playlist-picker__results')).toBeTruthy();
  expect(
    (screen.getByRole('textbox', {name: 'Choose playlist'}) as HTMLInputElement)
      .value,
  ).toBe('Listening');
  fireEvent.change(edit, {target: {value: 'review'}});
  fireEvent.submit(edit.closest('form')!);
  expect(onRenamePlaylist).not.toHaveBeenCalled();
  fireEvent.change(edit, {target: {value: 'Listening practice'}});
  fireEvent.click(screen.getByRole('button', {name: 'Rename'}));
  expect(onRenamePlaylist).toHaveBeenCalledWith(
    'Listening',
    'Listening practice',
  );

  fireEvent.change(enterManagement(), {target: {value: ' review '}});
  const remove = screen.getByRole('button', {name: /Remove playlist.*Review/});
  expect(screen.queryByRole('button', {name: 'New playlist'})).toBeNull();
  fireEvent.click(remove);
  expect(onRemovePlaylist).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.click(remove);
  expect(onRemovePlaylist).toHaveBeenCalledWith('Review');

  fireEvent.change(enterManagement(), {target: {value: ' Speaking '}});
  fireEvent.click(screen.getByRole('button', {name: 'New playlist'}));
  expect(onCreatePlaylist).toHaveBeenCalledWith('Speaking');

  fireEvent.click(screen.getByRole('button', {name: 'Add audio files'}));
  const folderInput = document.querySelector<HTMLInputElement>(
    'input[webkitdirectory]',
  )!;
  const openFolder = vi
    .spyOn(folderInput, 'click')
    .mockImplementation(() => {});
  fireEvent.click(screen.getByRole('button', {name: 'Add audio folder'}));
  expect(openFolder).toHaveBeenCalledTimes(1);

  const files = [new File([], 'first.mp3'), new File([], 'second.wav')];
  fireEvent.change(folderInput, {target: {files}});
  expect(onAddFiles).toHaveBeenCalledWith(files);
});

it('sorts by displayed name and keeps the active playlist selected', () => {
  render(
    <Provider store={store}>
      <Playlist
        playlistNames={['Vocabulary', 'Speaking', '', 'Review', 'Listening']}
        activePlaylist="Vocabulary"
        onSwitchPlaylist={vi.fn()}
        onCreatePlaylist={vi.fn()}
        onRenamePlaylist={vi.fn()}
        onRemovePlaylist={vi.fn()}
        onSelectTrack={vi.fn()}
        onRemoveTrack={vi.fn()}
        onAddFiles={vi.fn()}
        onClose={vi.fn()}
      />
    </Provider>,
  );

  fireEvent.click(screen.getByRole('button', {name: 'Choose playlist'}));
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.getByRole('button', {name: 'Rename Vocabulary'})).toBeTruthy();
  expect(screen.queryByRole('button', {name: 'Remove playlist'})).toBeNull();
  const active = screen.getByRole('button', {
    name: 'Vocabulary',
    pressed: true,
  });
  expect(
    screen.getAllByRole('button', {pressed: false}).map(row => row.textContent),
  ).toEqual(['Default', 'Listening', 'Review', 'Speaking']);
  expect(active.parentElement?.parentElement?.lastElementChild).toBe(
    active.parentElement,
  );
  const trigger = screen.getByRole('button', {
    name: 'Vocabulary',
    expanded: true,
  });
  const tap = {changedTouches: [{clientX: 40, clientY: 20}], touches: []};
  fireEvent.touchEnd(trigger, tap);
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.touchEnd(trigger, tap);
  expect(screen.getByRole('textbox')).toBe(document.activeElement);
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(
    'Vocabulary',
  );
  expect(screen.getAllByRole('button', {name: /Remove playlist/})).toHaveLength(
    1,
  );
  const toggle = screen.getByRole('button', {name: 'Choose playlist'});
  fireEvent.change(screen.getByRole('textbox'), {target: {value: 'Draft'}});
  expect(screen.getByRole('button', {name: 'New playlist'})).toBeTruthy();
  fireEvent.click(toggle);
  expect(screen.queryByRole('textbox')).toBeNull();
  const browse = screen.getByRole('button', {name: 'Choose playlist'});
  browse.focus();
  fireEvent.click(browse);
  expect(screen.queryByRole('button', {name: 'New playlist'})).toBeNull();
  expect(screen.getAllByRole('button', {name: /Remove playlist/})).toHaveLength(
    5,
  );
  fireEvent.click(screen.getByRole('button', {name: 'Rename Review'}));
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(
    'Review',
  );
  fireEvent.change(screen.getByRole('textbox'), {target: {value: 'Unsaved'}});
  fireEvent.click(browse);
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.getByRole('button', {name: 'Vocabulary'})).toBeTruthy();
  expect(browse.getAttribute('aria-expanded')).toBe('false');
  expect(
    browse.closest('form')?.classList.contains('playlist-picker__active'),
  ).toBe(false);
});
