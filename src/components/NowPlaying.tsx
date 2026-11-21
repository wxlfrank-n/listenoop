/**
 * Displays currently playing track information.
 *
 * Shows:
 * - Track title, duration, sample rate, and bitrate
 * - Music note icon (static when no track, animated when playing)
 *
 * Falls back to "No track selected" message when the playlist is empty.
 */

import {memo} from 'react';
import type {ReactNode} from 'react';
import {useAudioMeta} from '../hooks/useAudioMeta';
import {useAppSelector} from '../store/hooks';
import {selectCurrentTrack, selectDuration} from '../store/selectors';
import {ListeningLoopIcon} from './ListeningLoopIcon';
import {useT} from '../i18n';
import './NowPlaying.css';

interface NowPlayingProps {
  /** Rendered at the right end of the row, vertically centred with the art. */
  actions?: ReactNode;
}

export const NowPlaying = memo(({actions}: NowPlayingProps) => {
  const track = useAppSelector(selectCurrentTrack);
  const playbackDuration = useAppSelector(selectDuration);
  const duration = track && track.duration > 0 ? track.duration : playbackDuration;
  const seconds = Math.floor(duration);
  const meta = useAudioMeta(track?.url ?? null);
  const details = [
    Number.isFinite(duration) && duration > 0
      ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
      : null,
    meta ? `${(meta.sampleRate / 1000).toFixed(1)} kHz` : null,
    meta ? `${meta.bitrate} kbps` : null,
  ].filter(Boolean).join(' · ');
  const t = useT();

  if (!track) {
    return (
      <div className="now-playing now-playing--empty">
        <div className="now-playing__art">
          <ListeningLoopIcon size="100%" className="app-logo" />
        </div>
        <div className="now-playing__info">
          <span className="now-playing__title">{t('nowPlaying.noTrack')}</span>
          <span className="now-playing__hint">
            {t('nowPlaying.addMusic')}
          </span>
        </div>
        {actions && <div className="now-playing__actions">{actions}</div>}
      </div>
    );
  }

  return (
    <div className="now-playing">
      <div className="now-playing__art now-playing__art--active">
        <ListeningLoopIcon size="100%" className="app-logo" />
      </div>
      <div className="now-playing__info">
        <span className="now-playing__title">{track.title}</span>
        {details && <span className="now-playing__meta">{details}</span>}
      </div>
      {actions && <div className="now-playing__actions">{actions}</div>}
    </div>
  );
});
