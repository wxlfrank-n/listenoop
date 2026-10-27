/**
 * Redux slice for player configuration.
 *
 * Persisted settings (auto-saved to localStorage under Listeenoop_config):
 * - skipSeconds: Skip duration for forward/backward buttons (default: 10s)
 * - waveformView: Waveform display mode ("stacked" or "horizontal",
 *   default: "horizontal")
 * - blockMs: Silence-detection block size in milliseconds (default: 12)
 * - silenceRatio: Silence cutoff as a ratio of the track peak (default: 0.01)
 * - minClipLength: Minimum clip length detection attempts to achieve by
 *   merging short runs into neighbors (default: 0.3). Not a guarantee: a lone
 *   short clip may survive, and the unmerged fallback can also leave shorter
 *   clips.
 * - minSplitPieceSec: Smallest piece a clip may be left alone as after a
 *   split, and the floor detection also merges short runs up to (default: 0.1,
 *   see `MIN_SPLIT_PIECE_SEC`).
 * - repetitions: How many times a clicked clip is repeated (default: 3).
 * - loopPlaylist: Whether reaching the end of a track rolls on to the next
 *   track in the playlist; when off playback stops at the end (default: false).
 * - showAdvancedControls: Whether the clip toolbar (merge gap + repeat
 *   controls) is shown below the waveform (default: false).
 * - mergeScope: Whether a merge/split gesture applies to every clip in the
 *   track ("global") or only the selected clip ("clip") (default: "clip").
 * - theme: Appearance palette (system/dark/light/midnight/paper/nova/rose/
 *   qinghua/yingluo/norge). Each theme carries its own accent color, so there is no
 *   is no separate accent setting.
 * - language: UI locale ("en" | "zh" | "no", default: "no").
 *
 * Changes persist to localStorage immediately.
 */

import {createSlice} from '@reduxjs/toolkit';
import type {PayloadAction} from '@reduxjs/toolkit';
import type {MergeScope, WaveformView} from '../types';
import type {ThemeId} from '../themes';
import {DEFAULT_THEME, THEME_IDS} from '../themes';
import {isLocale, type LocaleId} from '../i18n/translations';
import {MIN_SPLIT_PIECE_SEC} from '../utils/clips';

const STORAGE_KEY = 'Listeenoop_config';

export const MERGE_SCOPES: readonly MergeScope[] = ['global', 'clip'];

function isMergeScope(value: unknown): value is MergeScope {
  return MERGE_SCOPES.includes(value as MergeScope);
}

interface ConfigState {
  skipSeconds: number;
  waveformView: WaveformView;
  blockMs: number;
  silenceRatio: number;
  minClipLength: number;
  minSplitPieceSec: number;
  repetitions: number;
  loopPlaylist: boolean;
  showAdvancedControls: boolean;
  mergeScope: MergeScope;
  theme: ThemeId;
  language: LocaleId;
}

export const DEFAULT_CONFIG: ConfigState = {
  skipSeconds: 10,
  waveformView: 'horizontal',
  blockMs: 12,
  silenceRatio: 0.01,
  minClipLength: 0.3,
  minSplitPieceSec: MIN_SPLIT_PIECE_SEC,
  repetitions: 3,
  loopPlaylist: false,
  showAdvancedControls: false,
  mergeScope: 'clip',
  theme: DEFAULT_THEME,
  language: 'no',
};

/** Valid numeric ranges for each configurable value (drives the Settings UI). */
export const CONFIG_RANGES = {
  skipSeconds: {min: 1, max: 60},
  blockMs: {min: 2, max: 64},
  // Capped at the detector's own ceiling (`clips.ts` clamps to 0.02): higher
  // values behave identically, so the slider stops here instead of offering a
  // dead range.
  silenceRatio: {min: 0.005, max: 0.02},
  minClipLength: {min: 0.2, max: 1},
  minSplitPieceSec: {min: 0.01, max: 0.5},
  repetitions: {min: 1, max: 20},
} as const;

function loadConfig(): ConfigState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        theme: THEME_IDS.includes(parsed.theme) ? parsed.theme : DEFAULT_THEME,
        repetitions: Number.isFinite(parsed.repetitions)
          ? Math.min(
              CONFIG_RANGES.repetitions.max,
              Math.max(
                CONFIG_RANGES.repetitions.min,
                Math.round(parsed.repetitions),
              ),
            )
          : DEFAULT_CONFIG.repetitions,
        showAdvancedControls:
          typeof parsed.showAdvancedControls === 'boolean'
            ? parsed.showAdvancedControls
            : DEFAULT_CONFIG.showAdvancedControls,
        loopPlaylist:
          typeof parsed.loopPlaylist === 'boolean'
            ? parsed.loopPlaylist
            : DEFAULT_CONFIG.loopPlaylist,
        language: isLocale(parsed.language)
          ? parsed.language
          : DEFAULT_CONFIG.language,
        mergeScope: isMergeScope(parsed.mergeScope)
          ? parsed.mergeScope
          : DEFAULT_CONFIG.mergeScope,
        // Stored values from when the slider ran past the detector ceiling
        // still clamp to identical behavior.
        silenceRatio: Number.isFinite(parsed.silenceRatio)
          ? Math.min(
              CONFIG_RANGES.silenceRatio.max,
              Math.max(CONFIG_RANGES.silenceRatio.min, parsed.silenceRatio),
            )
          : DEFAULT_CONFIG.silenceRatio,
      };
    }
  } catch {
    console.warn('Failed to load config from localStorage, using defaults.');
  }
  return {...DEFAULT_CONFIG};
}

function saveConfig(config: ConfigState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

const initialState: ConfigState = loadConfig();

export const configSlice = createSlice({
  name: 'config',
  initialState,
  reducers: {
    updateConfig(state, action: PayloadAction<Partial<ConfigState>>) {
      const next = {...state, ...action.payload};
      saveConfig(next);
      return next;
    },
  },
});

export const {updateConfig} = configSlice.actions;
export default configSlice.reducer;
