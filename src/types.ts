import type {Clip} from './utils/clips';

/**
 * Represents a single audio track in the player.
 *
 * @property id - Unique identifier (usually the filename)
 * @property title - Display name of the track
 * @property artist - Artist name (usually "Unknown Artist" for MP3s without metadata)
 * @property duration - Length in seconds
 * @property url - URL to the audio file (either public or blob URL)
 * @property file - Optional: Original File object if user uploaded from disk
 */
export interface Track {
  id: string;
  title: string;
  artist: string;
  duration: number;
  url: string;
}

/**
 * Raw waveform data ready for visualization.
 *
 * @property data - Float32Array of audio samples (mono downmix)
 * @property sampleRate - Sample rate of the audio (Hz)
 */
export interface WaveformData {
  data: Float32Array;
  sampleRate: number;
  duration: number;
}

/**
 * Loading state for waveform decoding.
 * - "idle": No URL or not started
 * - "loading": Actively decoding
 * - "ready": Successfully decoded
 * - "error": Failed to decode
 */
export type WaveformStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Waveform display mode.
 * - "stacked": Multiple rows, one per track (shows all clips)
 * - "horizontal": Single scrollable row with follow behavior
 */
export type WaveformView = 'stacked' | 'horizontal';

/**
 * How far a merge/split gesture reaches.
 *
 * - "global": one merge gap threshold regroups every clip in the track.
 * - "clip": the gesture only regroups the selected clip, leaving its neighbors
 *   alone.
 */
export type MergeScope = 'global' | 'clip';

/**
 * Direction of a swipe gesture on a clip.
 *
 * - "up"/"down": vertical, splits / merges with the nearest neighbor.
 * - "down-right": diagonal 15-75 deg below horizontal, merges with the clip to
 *   the right.
 * - "down-left": diagonal 15-75 deg below horizontal, merges with the clip to
 *   the left.
 * - "up-right": diagonal 15-75 deg above horizontal, splits the rightmost part
 *   of the merged clip.
 * - "up-left": diagonal 15-75 deg above horizontal, splits the leftmost part of
 *   the merged clip.
 */
export type SwipeDirection =
  'up' | 'down' | 'up-right' | 'down-right' | 'up-left' | 'down-left';

/**
 * Consolidated state for the currently played audio. Owned by the app root so
 * every view (waveform, clip toolbar, player controls) reads the same record
 * instead of deriving it independently.
 *
 * @property url - URL of the current track (null when nothing is loaded)
 * @property title - Display title of the current track (null when nothing is loaded)
 * @property waveform - Parsed mono audio samples, or null while not available
 * @property waveformStatus - Decode state ("idle" | "loading" | "ready" | "error")
 * @property clips - Clips detected by silence splitting on the parsed audio
 * @property currentTime - Current playback position in seconds
 * @property activeClip - Index of the selected clip (-1 for none)
 */
export interface CurrentAudio {
  url: string | null;
  title: string | null;
  waveform: WaveformData | null;
  waveformStatus: WaveformStatus;
  clips: Clip[];
  gaps: number[];
  initGap: number;
  currentTime: number;
}

/**
 * Viewport rectangle over the full waveform, shared by the waveform-drawing
 * components (WaveformBars, Clip, RowWaveform). References the start/window of
 * the visible slice in seconds plus the SVG viewBox geometry.
 *
 * @property windowStartSec - Start time (seconds) of the visible window
 * @property windowLen - Visible window length (seconds)
 * @property innerH - Inner drawing height (viewBox height minus padding)
 * @property vbW - SVG viewBox width
 * @property vbH - SVG viewBox height
 */
export interface WaveWindow {
  windowStartSec: number;
  windowLen: number;
  innerH: number;
  vbW: number;
  vbH: number;
}

/**
 * A one-shot request to start playing a clip, described as data.
 *
 * Split/merge regroups `displayClips`, so the clip that should be playing after
 * the gesture is only known afterwards. The owner of the gesture (ProgressBar)
 * publishes the request; the mounted waveform view consumes it.
 *
 * `nonce` makes each request distinguishable: a repeated request for the very
 * same clip must still re-arm playback, and the view guards against handling
 * the same one twice.
 */
export interface ClipPlayRequest {
  clip: Clip;
  repetitions: number;
  nonce: number;
}
