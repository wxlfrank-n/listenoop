/**
 * Lists all loaded tracks in the playlist.
 * Shows current playing track with highlight.
 * Allows selecting tracks and removing them from playlist.
 */

import type {Track} from '../types';
import {useT} from '../i18n';
import './TrackList.css';

interface TrackListProps {
  tracks: Track[];
  currentTrackIndex: number;
  onSelectTrack: (index: number) => void;
  onRemoveTrack: (index: number) => void;
}

export function TrackList({
  tracks,
  currentTrackIndex,
  onSelectTrack,
  onRemoveTrack,
}: TrackListProps) {
  const t = useT();
  if (tracks.length === 0) {
    return (
      <div className="track-list track-list--empty">
        <p>{t('trackList.empty')}</p>
        <p className="track-list__hint">{t('trackList.hint')}</p>
      </div>
    );
  }

  return (
    <div className="track-list">
      {tracks.map((track, index) => (
        <div
          key={track.id}
          className={`track-item ${index === currentTrackIndex ? 'track-item--active' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={`${index + 1}. ${track.title} — ${track.artist}`}
          aria-current={index === currentTrackIndex ? 'true' : undefined}
          onClick={() => onSelectTrack(index)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectTrack(index);
            }
          }}
        >
          <div className="track-item__info">
            <span className="track-item__number">{index + 1}</span>
            <div className="track-item__text">
              <span className="track-item__title">{track.title}</span>
              <span className="track-item__artist">{track.artist}</span>
            </div>
          </div>
          <button
            className="track-item__remove"
            aria-label={t('trackList.removeTrack')}
            onClick={e => {
              e.stopPropagation();
              onRemoveTrack(index);
            }}
          >
            {'\u2715'}
          </button>
        </div>
      ))}
    </div>
  );
}
