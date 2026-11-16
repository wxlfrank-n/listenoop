/**
 * Playlist panel - shows all loaded tracks and allows adding/removing files.
 * Slides out as a sidebar overlay. Shows current track highlight.
 * Supports file input for adding new tracks.
 */

import {useRef, useCallback, useState} from 'react';
import {TrackList} from './TrackList';
import {useAppSelector} from '../store/hooks';
import {selectTracks, selectCurrentTrackIndex} from '../store/selectors';
import {useT} from '../i18n';
import {useFocusTrap} from '../hooks/useFocusTrap';
import CloseIcon from '../assets/icons/close.svg?react';
import './Playlist.css';

interface PlaylistProps {
  playlistNames: string[];
  activePlaylist: string;
  onSwitchPlaylist: (name: string) => void;
  onCreatePlaylist: (name: string) => void;
  onSelectTrack: (index: number) => void;
  onRemoveTrack: (index: number) => void;
  onAddFiles: (files: FileList) => void;
  onClose: () => void;
}

export function Playlist({
  playlistNames,
  activePlaylist,
  onSwitchPlaylist,
  onCreatePlaylist,
  onSelectTrack,
  onRemoveTrack,
  onAddFiles,
  onClose,
}: PlaylistProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tracks = useAppSelector(selectTracks);
  const currentTrackIndex = useAppSelector(selectCurrentTrackIndex);
  const t = useT();
  const [playlistName, setPlaylistName] = useState<string | null>(null);

  const handleClose = useCallback(() => onClose(), [onClose]);

  // Trap Tab / Shift+Tab inside the panel, close on Escape, and restore
  // focus to the trigger button on unmount.
  useFocusTrap(panelRef, {onEscape: onClose});

  return (
    <div className="playlist-overlay" onClick={onClose}>
      <div
        className="playlist-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="playlist-title"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        <div className="playlist-header">
          <h2 id="playlist-title">
            {t('playlist.title', {count: tracks.length})}
          </h2>
          <div className="playlist-header__actions">
            <button
              className="add-btn"
              aria-label={t('playlist.addTracks')}
              onClick={() => fileInputRef.current?.click()}
            >
              +
            </button>
            <button
              className="playlist-close"
              onClick={handleClose}
              aria-label={t('playlist.close')}
            >
              <CloseIcon width={18} height={18} />
            </button>
          </div>
        </div>
        <div className="playlist-picker">
          <select
            aria-label={t('playlist.choose')}
            value={activePlaylist}
            onChange={e => onSwitchPlaylist(e.target.value)}
          >
            {playlistNames.map(name => (
              <option key={name} value={name}>
                {name || t('playlist.default')}
              </option>
            ))}
          </select>
          <button onClick={() => setPlaylistName('')}>
            {t('playlist.new')}
          </button>
        </div>
        {playlistName !== null && (
          <form
            className="playlist-picker"
            onSubmit={e => {
              e.preventDefault();
              const name = playlistName.trim();
              if (!name || playlistNames.includes(name)) return;
              onCreatePlaylist(name);
              setPlaylistName(null);
            }}
          >
            <input
              aria-label={t('playlist.name')}
              placeholder={t('playlist.name')}
              value={playlistName}
              onChange={e => setPlaylistName(e.target.value)}
            />
            <button
              disabled={
                !playlistName.trim() ||
                playlistNames.includes(playlistName.trim())
              }
            >
              {t('playlist.create')}
            </button>
            <button type="button" onClick={() => setPlaylistName(null)}>
              {t('playlist.cancel')}
            </button>
          </form>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,audio/mpeg,.wav,audio/wav,.ogg,audio/ogg,.m4a,audio/mp4,.flac,audio/flac,.webm,audio/webm"
          multiple
          onChange={e => {
            if (e.target.files) onAddFiles(e.target.files);
            e.target.value = '';
          }}
          style={{display: 'none'}}
        />
        <TrackList
          tracks={tracks}
          currentTrackIndex={currentTrackIndex}
          onSelectTrack={onSelectTrack}
          onRemoveTrack={onRemoveTrack}
        />
      </div>
    </div>
  );
}
