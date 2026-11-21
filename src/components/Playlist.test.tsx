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

  const input = screen.getByRole('textbox', {name: 'Choose playlist'});
  expect(screen.queryByRole('button', {name: 'Remove playlist'})).toBeNull();
  expect(screen.getByRole('button', {name: /01A/})).toBeTruthy();
  expect(screen.queryByRole('button', {name: 'Remove track'})).toBeNull();
  expect(screen.queryByRole('button', {name: 'Listening'})).toBeNull();
  const dropdown = screen.getByRole('button', {name: 'Choose playlist'});
  fireEvent.click(dropdown);
  expect(screen.getByRole('button', {name: 'Review'})).toBeTruthy();
  fireEvent.change(input, {target: {value: 'list'}});
  expect(screen.queryByRole('button', {name: 'Review'})).toBeNull();
  fireEvent.click(screen.getByRole('button', {name: 'Listening'}));
  expect(onSwitchPlaylist).toHaveBeenCalledWith('Listening');
  expect(dropdown.getAttribute('aria-expanded')).toBe('false');

  fireEvent.change(input, {target: {value: 'Listening'}});
  expect(screen.getByRole('button', {name: 'Rename'})).toBeTruthy();
  fireEvent.click(dropdown);
  expect(screen.queryByRole('button', {name: 'Rename'})).toBeNull();
  expect(screen.queryByRole('button', {name: 'Remove playlist'})).toBeNull();
  fireEvent.click(input);
  fireEvent.click(screen.getByRole('button', {name: 'Rename'}));
  const edit = screen.getByRole('textbox', {name: 'Playlist name'});
  fireEvent.change(edit, {target: {value: 'review'}});
  fireEvent.submit(edit.closest('form')!);
  expect(onRenamePlaylist).not.toHaveBeenCalled();
  fireEvent.change(edit, {target: {value: 'Listening practice'}});
  fireEvent.click(screen.getByRole('button', {name: 'Rename'}));
  expect(onRenamePlaylist).toHaveBeenCalledWith(
    'Listening',
    'Listening practice',
  );

  fireEvent.change(input, {target: {value: ' review '}});
  const remove = screen.getByRole('button', {name: 'Remove playlist'});
  expect(screen.queryByRole('button', {name: 'New playlist'})).toBeNull();
  fireEvent.click(remove);
  expect(onRemovePlaylist).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.click(remove);
  expect(onRemovePlaylist).toHaveBeenCalledWith('Review');

  fireEvent.change(input, {target: {value: ' Speaking '}});
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


it('shows the active playlist first when opening the dropdown', () => {
  render(
    <Provider store={store}>
      <Playlist
        playlistNames={['', 'Listening', 'Review', 'Speaking', 'Vocabulary']}
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
  const active = screen.getByRole('button', {
    name: 'Vocabulary',
    pressed: true,
  });
  expect(active.parentElement?.firstElementChild).toBe(active);
});
