/**
 * Playlist panel - shows all loaded tracks and allows adding/removing files.
 * Slides out as a sidebar overlay. Shows current track highlight.
 * Supports file input for adding new tracks.
 */

import {useRef, useState} from 'react';
import {isDefaultTrack} from '../defaultTracks';
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
  onRenamePlaylist: (oldName: string, newName: string) => void;
  onRemovePlaylist: (name: string) => void;
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
  onRenamePlaylist,
  onRemovePlaylist,
  onSelectTrack,
  onRemoveTrack,
  onAddFiles,
  onClose,
}: PlaylistProps) {
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tracks = useAppSelector(selectTracks);
  const currentTrackIndex = useAppSelector(selectCurrentTrackIndex);
  const t = useT();
  const [query, setQuery] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const label = (name: string) => name || t('playlist.default');
  const input = query ?? label(activePlaylist);
  const name = input.trim();
  const search = name.toLowerCase();
  const exact =
    query === null
      ? activePlaylist
      : (playlistNames.find(item => label(item) === name) ??
        playlistNames.find(item => label(item).toLowerCase() === search));
  const canRename =
    !!editing &&
    !!name &&
    name !== editing &&
    !playlistNames.some(
      item => item !== editing && label(item).toLowerCase() === search,
    );
  const matches = playlistNames.filter(
    item => query === null || label(item).toLowerCase().includes(search),
  );
  const results = matches.includes(activePlaylist)
    ? [activePlaylist, ...matches.filter(item => item !== activePlaylist)]
    : matches;

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
          <div className="playlist-picker">
            <form
              onSubmit={event => {
                event.preventDefault();
                if (editing) {
                  if (!canRename) return;
                  onRenamePlaylist(editing, name);
                  setEditing(null);
                } else if (exact !== undefined) {
                  onSwitchPlaylist(exact);
                } else if (name) {
                  onCreatePlaylist(name);
                }
                setQuery(null);
                setDropdownOpen(false);
              }}
            >
              <input
                ref={inputRef}
                aria-label={t(editing ? 'playlist.name' : 'playlist.choose')}
                value={input}
                onFocus={event => event.target.select()}
                onClick={() => {
                  if (!editing) setDropdownOpen(true);
                }}
                onChange={event => {
                  setImportMenuOpen(false);
                  setQuery(event.target.value);
                  if (!editing) setDropdownOpen(true);
                }}
                onKeyDown={event => {
                  if (!editing && event.key === 'ArrowDown') {
                    event.preventDefault();
                    setDropdownOpen(true);
                  }
                }}
              />
              {editing && (
                <>
                  <button type="submit" disabled={!canRename}>
                    {t('playlist.rename')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(null);
                      setQuery(null);
                    }}
                  >
                    {t('playlist.cancel')}
                  </button>
                </>
              )}
              {!editing && name && exact === undefined && (
                <button type="submit" aria-label={t('playlist.new')}>
                  +
                </button>
              )}
              {dropdownOpen && !editing && exact && (
                <button
                  type="button"
                  className="playlist-picker__icon-action"
                  aria-label={t('playlist.rename')}
                  onClick={() => {
                    setDropdownOpen(false);
                    setEditing(exact);
                    setQuery(exact);
                    inputRef.current?.focus();
                    inputRef.current?.select();
                  }}
                >
                  &#9998;
                </button>
              )}
              {dropdownOpen && !editing && exact && (
                <button
                  type="button"
                  className="playlist-picker__icon-action"
                  aria-label={t('playlist.remove')}
                  onClick={() => {
                    if (
                      window.confirm(t('playlist.confirmRemove', {name: exact}))
                    ) {
                      setDropdownOpen(false);
                      onRemovePlaylist(exact);
                      setQuery(null);
                    }
                  }}
                >
                  <CloseIcon width={16} height={16} />
                </button>
              )}
              {!editing && (
                <button
                  type="button"
                  className="playlist-picker__toggle"
                  aria-label={t('playlist.choose')}
                  aria-expanded={dropdownOpen}
                  onClick={() => {
                    setImportMenuOpen(false);
                    setDropdownOpen(open => !open);
                  }}
                >
                  <span aria-hidden="true" />
                </button>
              )}
            </form>
            {dropdownOpen && !editing && results.length > 0 && (
              <div className="playlist-picker__results">
                {results.map(item => (
                  <button
                    type="button"
                    key={item}
                    aria-pressed={item === activePlaylist}
                    onClick={() => {
                      onSwitchPlaylist(item);
                      setDropdownOpen(false);
                      setQuery(null);
                    }}
                  >
                    {label(item)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <h2
            id="playlist-title"
            className="playlist-track-count"
            aria-label={t('playlist.title', {count: tracks.length})}
          >
            {t(
              tracks.length === 1
                ? 'playlist.trackCountOne'
                : 'playlist.trackCount',
              {
                count: tracks.length,
              },
            )}
          </h2>
          <div className="playlist-import">
            <button
              type="button"
              className="add-btn"
              aria-label={t('playlist.addTracks')}
              aria-expanded={importMenuOpen}
              onClick={() => {
                setDropdownOpen(false);
                setImportMenuOpen(open => !open);
              }}
            >
              <span aria-hidden="true">&#9835;</span>
            </button>
            {importMenuOpen && (
              <div className="playlist-import__options">
                <button
                  type="button"
                  onClick={() => {
                    fileInputRef.current?.click();
                    setImportMenuOpen(false);
                  }}
                >
                  {t('playlist.addTracks')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    folderInputRef.current?.click();
                    setImportMenuOpen(false);
                  }}
                >
                  {t('playlist.addFolder')}
                </button>
              </div>
            )}
          </div>
        </div>
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
        <input
          ref={input => {
            folderInputRef.current = input;
            input?.setAttribute('webkitdirectory', '');
          }}
          type="file"
          multiple
          hidden
          onChange={event => {
            if (event.target.files?.length) onAddFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <TrackList
          tracks={tracks}
          currentTrackIndex={currentTrackIndex}
          onSelectTrack={onSelectTrack}
          onRemoveTrack={onRemoveTrack}
          canRemoveTrack={track =>
            activePlaylist !== '' || !isDefaultTrack(track.id)
          }
        />
      </div>
    </div>
  );
}
