// @vitest-environment jsdom

import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {Provider} from 'react-redux';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {store} from '../store/store';
import {Playlist} from './Playlist';
import {Settings} from './Settings';
import {PlayerActions} from './PlayerActions';

afterEach(cleanup);

describe('outside click closes overlays and menu', () => {
  it('menu closes on pointerdown outside the root', () => {
    render(
      <PlayerActions
        playlistOpen={false}
        onTogglePlaylist={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByRole('menu')).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('playlist closes on backdrop click but not on panel click', () => {
    const onClose = vi.fn();
    render(
      <Provider store={store}>
        <Playlist
          playlistNames={['']}
          activePlaylist=""
          onSwitchPlaylist={vi.fn()}
          onCreatePlaylist={vi.fn()}
          onSelectTrack={vi.fn()}
          onRemoveTrack={vi.fn()}
          onAddFiles={vi.fn()}
          onClose={onClose}
        />
      </Provider>,
    );
    fireEvent.click(document.querySelector('.playlist-panel')!);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('.playlist-overlay')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('settings closes on backdrop click but not on panel click', () => {
    const onClose = vi.fn();
    render(
      <Provider store={store}>
        <Settings onClose={onClose} />
      </Provider>,
    );
    fireEvent.click(document.querySelector('.settings-panel')!);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('.settings-overlay')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
