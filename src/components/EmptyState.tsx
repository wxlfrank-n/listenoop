/**
 * Full-card empty state shown when no track is loaded.
 *
 * Makes the entry point explicit: press the Add MP3 button (hidden file input).
 * This is the primary add affordance on small screens.
 */

import {useRef} from 'react';
import MusicNoteIcon from '../assets/icons/favicon.svg?react';
import {useT} from '../i18n';
import './EmptyState.css';

interface EmptyStateProps {
  onOpenPlaylist: () => void;
  onAddFiles: (files: FileList) => void;
}

export function EmptyState({onAddFiles, onOpenPlaylist}: EmptyStateProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = useT();

  return (
    <div className="empty-state-wrap">
      <div className="empty-state">
        <div className="empty-state__art">
          <MusicNoteIcon />
        </div>
        <h2 className="empty-state__title">{t('emptyState.title')}</h2>
        <p className="empty-state__subtitle">{t('emptyState.subtitle')}</p>
        <button
          className="empty-state__add"
          onClick={() => fileInputRef.current?.click()}
        >
          {t('emptyState.addFiles')}
        </button>
        <button className="empty-state__add" onClick={onOpenPlaylist}>
          {t('actions.playlist')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,audio/mpeg,.wav,audio/wav,.ogg,audio/ogg,.m4a,audio/mp4,.flac,audio/flac,.webm,audio/webm"
          multiple
          onChange={e => {
            if (e.target.files) onAddFiles(e.target.files);
            e.target.value = '';
          }}
          tabIndex={-1}
          style={{display: 'none'}}
        />
      </div>
    </div>
  );
}
