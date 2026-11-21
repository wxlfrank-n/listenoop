import {isDefaultTrack} from './defaultTracks';
import {defaultTracks} from './store/playerSlice';
/**
 * Main application component.
 *
 * The root container that orchestrates:
 * - Audio playback (useAudioPlayer hook)
 * - Playlist management
 * - Waveform visualization and analysis
 * - Settings panel
 * - File loading (file picker)
 * - Playback controls
 *
 * Layout:
 * - Main player card with waveform and controls
 * - Playlist sidebar (toggleable)
 * - Settings overlay (toggleable)
 *
 * Features:
 * - Load MP3 files via file input
 * - Play/pause with Web Audio for waveform visualization
 * - Skip forward/backward by configurable interval
 * - Seek via waveform click
 * - Range selection on waveform for looped playback
 * - Configurable skip interval and waveform display mode
 * - Auto-save config to localStorage
 */

import './App.css';

import {useRef, useCallback, useEffect, useState} from 'react';
import {useAudioPlayer} from './hooks/useAudioPlayer';
import {useConfig} from './hooks/useConfig';
import {useWaveform} from './hooks/useWaveform';
import {useClipDetection} from './hooks/useClipDetection';
import {useAddFiles} from './hooks/useAddFiles';
import {useDocumentLang} from './hooks/useDocumentLang';
import {loadPlaylists, savePlaylists} from './store/playlistStorage';
import {
  loadPlaybackPosition,
  savePlaybackPosition,
} from './store/playbackStorage';
import {store} from './store/store';
import type {SavedPlaylists} from './store/playlistStorage';
import {useAppSelector} from './store/hooks';
import {selectCurrentTrack} from './store/selectors';
import {NowPlaying} from './components/NowPlaying';
import {PlayerActions} from './components/PlayerActions';
import {PlayerControls} from './components/PlayerControls';
import {Playlist} from './components/Playlist';
import {ProgressBar} from './components/ProgressBar';
import {Settings} from './components/Settings';
import {EmptyState} from './components/EmptyState';
import {useT} from './i18n';

export default function App() {
  // Load user configuration from localStorage
  const {config} = useConfig();
  const t = useT();

  // Keep <html lang> in sync with the active locale so screen readers use
  // the right pronunciation rules (Norwegian for "no", etc.).
  useDocumentLang();

  // Set up audio player with all playback controls and state
  const {
    state: {currentTime, duration, isPlaying},
    setClipSequence,
    togglePlay,
    next,
    prev,
    seek,
    addTracks,
    capturePlaylistTracks,
    replacePlaylistTracks,
    removeTrack,
    selectTrack,
    skipForward,
    skipBackward,
    playRange,
    getAnalyser,
    getCurrentTime,
    playbackError,
    isClipPlaying,
    retryPlayback,
    nextTrack,
  } = useAudioPlayer(config.skipSeconds, config.playbackSpeed);

  // UI state for overlays
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Temporary notification message (auto-hides after 4s)
  const [notice, setNotice] = useState<{
    msg: string;
    type: 'info' | 'error';
  } | null>(null);
  const noticeTimerRef = useRef<number | undefined>(undefined);

  // Remember which element opened an overlay so focus can be returned on close.
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const restoreFocus = useCallback(() => {
    requestAnimationFrame(() => lastFocusRef.current?.focus());
  }, []);
  const togglePlaylist = useCallback(() => {
    if (!showPlaylist) {
      lastFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    }
    setShowPlaylist(v => !v);
  }, [showPlaylist]);
  const openSettings = useCallback(() => {
    lastFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    setShowSettings(true);
  }, []);
  const closePlaylist = useCallback(() => {
    setShowPlaylist(false);
    restoreFocus();
  }, [restoreFocus]);
  const closeSettings = useCallback(() => {
    setShowSettings(false);
    restoreFocus();
  }, [restoreFocus]);

  // Get current playing track from the store
  const currentTrack = useAppSelector(selectCurrentTrack);

  // Decode and extract waveform data for visualization. The worker also
  // returns the first set of clips (computed with the current config),
  // and publishes both to Redux.
  useWaveform(currentTrack?.url ?? null);

  // Re-run clip detection in the worker whenever the user changes
  // detection settings (silence threshold, analysis detail, min clip
  // length). The worker reuses its cached mono samples so this is fast
  // and doesn't re-fetch or re-decode the file.
  useClipDetection(currentTrack?.url ?? null, {
    blockMs: config.blockMs,
    silenceRatio: config.silenceRatio,
    minClipLength: config.minClipLength,
    expansionRate: config.expansionRate,
  });

  const showNotice = useCallback(
    (msg: string, type: 'info' | 'error' = 'info') => {
      setNotice({msg, type});
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = window.setTimeout(() => setNotice(null), 4000);
    },
    [],
  );

  const [playlists, setPlaylists] = useState<SavedPlaylists | null>(null);
  const playlistsRef = useRef<SavedPlaylists | null>(null);
  const playlistLoadFailed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    function initialize(saved?: SavedPlaylists) {
      if (cancelled) return;
      const savedDefault = saved?.lists.find(list => list.name === '');
      const tracks = savedDefault?.tracks ?? [];
      const defaultList = {
        name: '',
        tracks: [
          ...tracks,
          ...defaultTracks
            .filter(
              track => !tracks.some(savedTrack => savedTrack.id === track.id),
            )
            .map(({url, ...track}) => ({...track, source: url})),
        ],
      };
      const lists = saved?.lists ?? [];
      const library = {
        active: saved?.active ?? '',
        lists: savedDefault
          ? lists.map(list => (list.name === '' ? defaultList : list))
          : [defaultList, ...lists],
      };
      const resume = loadPlaybackPosition(library.active);
      const selected = library.lists.find(list => list.name === library.active);
      if (selected && (saved || resume))
        replacePlaylistTracks(selected.tracks, resume);
      playlistsRef.current = library;
      setPlaylists(library);
    }
    loadPlaylists().then(initialize, () => {
      if (cancelled) return;
      playlistLoadFailed.current = true;
      initialize();
    });
    return () => {
      cancelled = true;
    };
  }, [replacePlaylistTracks]);

  const lastPlaybackSave = useRef(0);
  useEffect(() => {
    if (!playlists || (currentTrack && !(duration > 0))) return;
    const now = Date.now();
    if (isPlaying && now - lastPlaybackSave.current < 1000) return;
    savePlaybackPosition(playlists.active, currentTrack?.id, currentTime);
    lastPlaybackSave.current = now;
  }, [playlists, currentTrack, currentTime, duration, isPlaying]);

  useEffect(() => {
    const flushPosition = () => {
      const library = playlistsRef.current;
      if (!library) return;
      const player = store.getState().player;
      const track = player.tracks[player.currentTrackIndex];
      if (track && !(player.duration > 0)) return;
      savePlaybackPosition(library.active, track?.id, player.currentTime);
    };
    window.addEventListener('pagehide', flushPosition);
    return () => window.removeEventListener('pagehide', flushPosition);
  }, []);

  function updatePlaylists(next: SavedPlaylists) {
    playlistsRef.current = next;
    setPlaylists(next);
    const reportError = () => showNotice(t('playlist.saveError'), 'error');
    if (playlistLoadFailed.current) reportError();
    else void savePlaylists(next).catch(reportError);
  }

  function saveActiveTracks() {
    const library = playlistsRef.current;
    if (!library) return;
    updatePlaylists({
      ...library,
      lists: library.lists.map(list =>
        list.name === library.active
          ? {...list, tracks: capturePlaylistTracks()}
          : list,
      ),
    });
  }

  function switchPlaylist(name: string) {
    const library = playlistsRef.current;
    if (!library || name === library.active) return;
    const selected = library.lists.find(list => list.name === name);
    if (!selected) return;
    replacePlaylistTracks(selected.tracks);
    updatePlaylists({...library, active: name});
  }

  function createPlaylist(input: string) {
    const library = playlistsRef.current;
    const name = input.trim();
    if (!library || !name || library.lists.some(list => list.name === name))
      return;
    replacePlaylistTracks([]);
    updatePlaylists({
      active: name,
      lists: [...library.lists, {name, tracks: []}],
    });
  }

  function renamePlaylist(oldName: string, input: string) {
    const library = playlistsRef.current;
    const name = input.trim();
    if (
      !library ||
      !oldName ||
      !name ||
      !library.lists.some(list => list.name === oldName) ||
      library.lists.some(
        list =>
          list.name !== oldName &&
          list.name.toLowerCase() === name.toLowerCase(),
      )
    )
      return;
    const position = loadPlaybackPosition(oldName);
    if (position) savePlaybackPosition(name, position.trackId, position.time);
    updatePlaylists({
      active: library.active === oldName ? name : library.active,
      lists: library.lists.map(list =>
        list.name === oldName ? {...list, name} : list,
      ),
    });
  }

  function removePlaylist(name: string) {
    const library = playlistsRef.current;
    if (!library || !name || !library.lists.some(list => list.name === name))
      return;
    const lists = library.lists.filter(list => list.name !== name);
    const active = library.active === name ? '' : library.active;
    if (loadPlaybackPosition(name)) savePlaybackPosition(name, undefined, 0);
    if (library.active === name) {
      replacePlaylistTracks(lists.find(list => list.name === '')?.tracks ?? []);
    }
    updatePlaylists({active, lists});
  }

  // Adding files (file picker) with a skip notice for non-MP3 files.
  const {handleFiles} = useAddFiles(
    (files, playAfter) => {
      const result = addTracks(files, playAfter);
      if (result.added) saveActiveTracks();
      return result;
    },
    useCallback(
      (skipped: number) =>
        showNotice(
          t(skipped > 1 ? 'app.skippedNonMp3Plural' : 'app.skippedNonMp3', {
            count: skipped,
          }),
        ),
      [showNotice, t],
    ),
  );

  return (
    <div className="app">
      <div className="player-layout" inert={!playlists}>
        <div className="player-main">
          {currentTrack ? (
            <div className="player-card">
              <NowPlaying
                actions={
                  <PlayerActions
                    playlistOpen={showPlaylist}
                    onTogglePlaylist={togglePlaylist}
                    onOpenSettings={openSettings}
                  />
                }
              />
              <ProgressBar
                key={currentTrack?.url ?? 'none'}
                setClipSequence={setClipSequence}
                onSeek={seek}
                onPlayRange={playRange}
                onStopPlayback={togglePlay}
                getAnalyser={getAnalyser}
                getCurrentTime={getCurrentTime}
              />
              <PlayerControls
                clipPlaying={isClipPlaying}
                onTogglePlay={togglePlay}
                onNext={next}
                onPrev={prev}
                onSkipForward={skipForward}
                onSkipBackward={skipBackward}
              />
              {playbackError && (
                <div className="playback-error" role="alert">
                  <p>{t('player.playbackError')}</p>
                  <button onClick={retryPlayback}>{t('player.retry')}</button>
                  <button onClick={nextTrack}>{t('player.nextTrack')}</button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="player-main__corner-actions">
                <PlayerActions
                  playlistOpen={showPlaylist}
                  onTogglePlaylist={togglePlaylist}
                  onOpenSettings={openSettings}
                />
              </div>
              <EmptyState
                onAddFiles={handleFiles}
                onOpenPlaylist={togglePlaylist}
              />
            </>
          )}
        </div>
      </div>

      {showPlaylist && playlists && (
        <Playlist
          onSelectTrack={selectTrack}
          playlistNames={playlists.lists.map(list => list.name)}
          activePlaylist={playlists.active}
          onSwitchPlaylist={switchPlaylist}
          onCreatePlaylist={createPlaylist}
          onRenamePlaylist={renamePlaylist}
          onRemovePlaylist={removePlaylist}
          onRemoveTrack={index => {
            const track = store.getState().player.tracks[index];
            if (
              !track ||
              (playlistsRef.current?.active === '' && isDefaultTrack(track.id))
            )
              return;
            removeTrack(index);
            saveActiveTracks();
          }}
          onAddFiles={handleFiles}
          onClose={closePlaylist}
        />
      )}

      {showSettings && <Settings onClose={closeSettings} />}

      {notice && (
        <div
          className={`app-notice app-notice--${notice.type}`}
          role="status"
          aria-live="polite"
        >
          {notice.msg}
        </div>
      )}
    </div>
  );
}
