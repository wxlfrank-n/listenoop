/**
 * Shared selectors for the app store.
 *
 * Components read player/analysis/config state through these so the shapes of
 * the slices stay encapsulated. `selectCurrentAudio` assembles the consolidated
 * "current audio" record used by the waveform and clip views.
 */

import {createSelector} from '@reduxjs/toolkit';
import type {RootState} from './store';
import type {CurrentAudio} from '../types';
import type {SplitOptions} from '../utils/clips';

// ---- config ----
export const selectSkipSeconds = (s: RootState) => s.config.skipSeconds;
export const selectWaveformView = (s: RootState) => s.config.waveformView;
/** How many times a clicked clip is repeated. */
export const selectRepetitions = (s: RootState) => s.config.repetitions ?? 3;
/** Whether the clip toolbar (merge gap + repeats) is visible. */
export const selectShowAdvancedControls = (s: RootState) =>
  s.config.showAdvancedControls ?? true;
/** Whether a merge/split gesture applies to the whole track or one clip. */
export const selectMergeScope = (s: RootState) => s.config.mergeScope ?? 'clip';
/** Smallest piece a split may leave alone. */
export const selectMinClipLength = (s: RootState) => s.config.minClipLength;

/**
 * Detection options bundle (blockMs / silenceRatio / minClipLength) used by the worker's `decode` and `redetect` requests.
 *
 * Memoized so consumers (`useAudioPlayer` reads this into a ref) don't get a
 * fresh object reference on every store update — without `createSelector`
 * the inline `useAppSelector(s => ({...}))` returned a new object each call,
 * tripping Redux's selector-stability check ("Selector returned a different
 * result when called with the same parameters") and causing `useAudioPlayer`
 * to re-render on every store tick.
 */
export const selectDetectionOptions = createSelector(
  [s => s.config],
  (config): SplitOptions => ({
    blockMs: config.blockMs,
    silenceRatio: config.silenceRatio,
    minClipLength: config.minClipLength,
  }),
);

// ---- player ----
export const selectTracks = (s: RootState) => s.player.tracks;
export const selectCurrentTrackIndex = (s: RootState) =>
  s.player.currentTrackIndex;
export const selectIsPlaying = (s: RootState) => s.player.isPlaying;
export const selectCurrentTime = (s: RootState) => s.player.currentTime;
export const selectDuration = (s: RootState) => s.player.duration;

export const selectCurrentTrack = (s: RootState) => {
  const t = s.player.tracks[s.player.currentTrackIndex];
  return t ?? null;
};

export const selectCanPlay = (s: RootState) => s.player.tracks.length > 0;

// ---- analysis ----
/** Detected silent-gap lengths the merge slider snaps to, ascending. */
export const selectGaps = (s: RootState) => s.analysis.gaps;

export interface CurrentAudioInput {
  track: ReturnType<typeof selectCurrentTrack> | null;
  waveform: RootState['analysis']['waveform'];
  waveformStatus: RootState['analysis']['waveformStatus'];
  clips: RootState['analysis']['clips'];
  gaps: RootState['analysis']['gaps'];
  initGap: RootState['analysis']['initGap'];
  currentTime: RootState['player']['currentTime'];
}

export function toCurrentAudio({
  track,
  waveform,
  waveformStatus,
  clips,
  gaps,
  initGap,
  currentTime,
}: CurrentAudioInput): CurrentAudio {
  return {
    url: track?.url ?? null,
    title: track?.title ?? null,
    waveform: waveformStatus === 'ready' ? waveform : null,
    waveformStatus,
    clips,
    gaps,
    initGap,
    currentTime,
  };
}

export function selectCurrentAudio(s: RootState): CurrentAudio {
  const track = selectCurrentTrack(s);
  return toCurrentAudio({
    track,
    waveform: s.analysis.waveform,
    waveformStatus: s.analysis.waveformStatus,
    clips: s.analysis.clips,
    gaps: s.analysis.gaps,
    initGap: s.analysis.initGap,
    currentTime: s.player.currentTime,
  });
}
