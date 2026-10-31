/**
 * Redux slice for player configuration.
 *
 * Persisted settings (auto-saved to localStorage under Listeenoop_config):
 * - skipSeconds: Skip duration for forward/backward buttons (default: 10s)
 * - waveformView: Waveform display mode ("stacked" or "horizontal",
 *   default: "horizontal")
 * - blockMs: RMS analysis window in milliseconds (default: 12)
 * - silenceRatio: Relative energy/noise-floor sensitivity (default: 0.01)
 * - minClipLength: Minimum interval length before expansion and after manual
 *   splits (default: 0.3). Short detected intervals merge with neighbors; an
 *   isolated interval below the minimum is omitted.
 * - expansionRate: Fraction of surrounding gaps included in playback (0.25–0.4).
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
  expansionRate: number;
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
  expansionRate: 0.25,
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
  minClipLength: {min: 0.3, max: 1},
  expansionRate: {min: 0.25, max: 0.4},
  repetitions: {min: 1, max: 20},
} as const;

/**
 * Clamp a numeric localStorage value into `range`, falling back to
 * `fallback` when the stored value isn't a finite number. Prevents a
 * hand-edited or corrupted localStorage entry (e.g. `skipSeconds: NaN`,
 * a string, or an absurd value) from propagating into the player — a NaN
 * skipSeconds would freeze the playhead at NaN the first time skip is used.
 */
function clampNumber(
  value: unknown,
  range: {min: number; max: number},
  fallback: number,
  {round = false}: {round?: boolean} = {},
): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.min(
    range.max,
    Math.max(range.min, round ? Math.round(n) : n),
  );
  return clamped;
}

function loadConfig(): ConfigState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Retired controls must not return through the stored-field spread.
      delete parsed.minSplitPieceSec;
      delete parsed.minSilenceSec;
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
        silenceRatio: clampNumber(
          parsed.silenceRatio,
          CONFIG_RANGES.silenceRatio,
          DEFAULT_CONFIG.silenceRatio,
        ),
        // Every remaining numeric field is clamped: a NaN or out-of-range
        // seed from a corrupted localStorage would otherwise propagate
        // into `audio.currentTime` arithmetic and freeze the playhead.
        skipSeconds: clampNumber(
          parsed.skipSeconds,
          CONFIG_RANGES.skipSeconds,
          DEFAULT_CONFIG.skipSeconds,
          {round: true},
        ),
        blockMs: clampNumber(
          parsed.blockMs,
          CONFIG_RANGES.blockMs,
          DEFAULT_CONFIG.blockMs,
          {round: true},
        ),
        expansionRate: clampNumber(
          parsed.expansionRate,
          CONFIG_RANGES.expansionRate,
          DEFAULT_CONFIG.expansionRate,
        ),
        minClipLength: clampNumber(
          parsed.minClipLength,
          CONFIG_RANGES.minClipLength,
          DEFAULT_CONFIG.minClipLength,
        ),
      };
    }
  } catch {
    console.warn('Failed to load config from localStorage, using defaults.');
  }
  return {...DEFAULT_CONFIG};
}

export function saveConfig(config: ConfigState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Settings still work for this session when storage is blocked or full.
    console.warn(
      'Unable to save settings; changes apply to this session only.',
    );
  }
}

const initialState: ConfigState = loadConfig();

export const configSlice = createSlice({
  name: 'config',
  initialState,
  reducers: {
    updateConfig(state, action: PayloadAction<Partial<ConfigState>>) {
      return {...state, ...action.payload};
    },
  },
});

export const {updateConfig} = configSlice.actions;
export default configSlice.reducer;
