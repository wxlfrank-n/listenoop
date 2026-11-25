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
  const [managing, setManaging] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTap = useRef<{time: number; x: number; y: number} | null>(null);
  function closePicker() {
    inputRef.current?.blur();
    lastTap.current = null;
    setManaging(false);
    setEditing(null);
    setQuery(null);
    setDropdownOpen(false);
  }
  function managePlaylists() {
    setQuery(label(activePlaylist));
    setEditing(null);
    lastTap.current = null;
    setImportMenuOpen(false);
    setManaging(true);
    setDropdownOpen(true);
  }
  const label = (name: string) => name || t('playlist.default');
  const input = query ?? label(activePlaylist);
  const name = input.trim();
  const search = name.toLowerCase();
  const exact =
    query === null
      ? activePlaylist
      : (playlistNames.find(item => label(item) === name) ??
        playlistNames.find(item => label(item).toLowerCase() === search));
  const [draft, setDraft] = useState('');
  const newName = draft.trim();
  const canRename =
    !!editing &&
    !!newName &&
    newName !== editing &&
    !playlistNames.some(
      item =>
        item !== editing && label(item).toLowerCase() === newName.toLowerCase(),
    );
  const matches = playlistNames.filter(
    item => query === null || label(item).toLowerCase().includes(search),
  );
  const results = matches.sort((a, b) =>
    label(a).localeCompare(label(b), undefined, {sensitivity: 'accent'}),
  );
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
          <div
            className="playlist-picker"
            onKeyDown={event => {
              if (event.key === 'Escape' && (dropdownOpen || managing)) {
                event.preventDefault();
                event.stopPropagation();
                closePicker();
              }
            }}
          >
            <form
              className={
                dropdownOpen || managing ? 'playlist-picker__active' : undefined
              }
              onSubmit={event => {
                event.preventDefault();
                if (!managing) return;
                if (exact !== undefined) {
                  onSwitchPlaylist(exact);
                } else if (name) {
                  onCreatePlaylist(name);
                } else return;
                closePicker();
              }}
            >
              {!managing && (
                <button
                  type="button"
                  className="playlist-picker__browse"
                  aria-expanded={dropdownOpen}
                  onClick={() => {
                    setImportMenuOpen(false);
                    setDropdownOpen(true);
                  }}
                  onDoubleClick={managePlaylists}
                  onTouchEnd={event => {
                    const touch = event.changedTouches[0];
                    if (!touch || event.touches.length) return;
                    const previous = lastTap.current;
                    const {clientX: x, clientY: y} = touch;
                    if (
                      previous &&
                      event.timeStamp - previous.time <= 350 &&
                      Math.hypot(x - previous.x, y - previous.y) <= 24
                    ) {
                      event.preventDefault();
                      managePlaylists();
                    } else {
                      lastTap.current = {time: event.timeStamp, x, y};
                    }
                  }}
                  onKeyDown={event => {
                    if (event.key === 'F2') {
                      event.preventDefault();
                      managePlaylists();
                    }
                  }}
                >
                  <b>{label(activePlaylist)}</b>
                </button>
              )}
              {managing && (
                <input
                  autoFocus
                  ref={inputRef}
                  aria-label={t('playlist.choose')}
                  value={input}
                  onFocus={event => event.target.select()}
                  onClick={() => {
                    if (!editing) setDropdownOpen(true);
                  }}
                  onChange={event => {
                    setImportMenuOpen(false);
                    setEditing(null);
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
              )}
              {managing && name && exact === undefined && (
                <button
                  type="submit"
                  className="playlist-picker__icon-action"
                  aria-label={t('playlist.new')}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 3v18M3 12h18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              )}
              <button
                type="button"
                className="playlist-picker__toggle"
                aria-label={t('playlist.choose')}
                aria-expanded={dropdownOpen}
                onClick={() => {
                  if (dropdownOpen) closePicker();
                  else {
                    setImportMenuOpen(false);
                    setDropdownOpen(true);
                  }
                }}
              >
                <span aria-hidden="true" />
              </button>
            </form>
            {dropdownOpen && results.length > 0 && (
              <div className="playlist-picker__results">
                <div className="playlist-picker__scroll">
                  {results.map(item =>
                    editing === item ? (
                      <form
                        key={item}
                        className="playlist-picker__row-editor"
                        onSubmit={event => {
                          event.preventDefault();
                          if (!canRename) return;
                          onRenamePlaylist(item, newName);
                          closePicker();
                        }}
                      >
                        <input
                          autoFocus
                          aria-label={t('playlist.name')}
                          value={draft}
                          onFocus={event => event.target.select()}
                          onChange={event => setDraft(event.target.value)}
                        />
                        <button
                          type="submit"
                          className="playlist-picker__icon-action"
                          aria-label={t('playlist.rename')}
                          disabled={!canRename}
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              d="m4 12 5 5L20 6"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="playlist-picker__icon-action"
                          aria-label={t('playlist.cancel')}
                          onClick={() => setEditing(null)}
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              d="M9 4 4 9l5 5M5 9h9a6 6 0 0 1 0 12"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </form>
                    ) : (
                      <div key={item} className="playlist-picker__result">
                        <button
                          type="button"
                          aria-pressed={item === activePlaylist}
                          onClick={() => {
                            onSwitchPlaylist(item);
                            closePicker();
                          }}
                        >
                          {label(item)}
                        </button>
                        <button
                          type="button"
                          className="playlist-picker__rename"
                          disabled={!item}
                          aria-label={t('playlist.rename') + ' ' + label(item)}
                          onClick={() => {
                            setDraft(item);
                            setEditing(item);
                          }}
                        >
                          &#9998;
                        </button>
                        <button
                          type="button"
                          disabled={!item}
                          aria-label={
                            t('playlist.remove') + ' · ' + label(item)
                          }
                          onClick={() => {
                            if (
                              window.confirm(
                                t('playlist.confirmRemove', {name: item}),
                              )
                            ) {
                              onRemovePlaylist(item);
                              closePicker();
                            }
                          }}
                        >
                          <CloseIcon width={16} height={16} />
                        </button>
                      </div>
                    ),
                  )}
                </div>
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
                closePicker();
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
          onSelectTrack={index => {
            closePicker();
            onSelectTrack(index);
          }}
          onRemoveTrack={onRemoveTrack}
          canRemoveTrack={track =>
            activePlaylist !== '' || !isDefaultTrack(track.id)
          }
        />
      </div>
    </div>
  );
}
