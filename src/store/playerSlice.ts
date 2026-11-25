/**
 * Redux slice for player playback state.
 *
 * Holds everything the audio engine exposes as mutable state: the track list,
 * which track is current, and live playback position. The audio element itself
 * stays a side effect inside `useAudioPlayer`; this slice is the single source
 * of truth that all components read.
 */

import {createSlice} from '@reduxjs/toolkit';
import type {PayloadAction} from '@reduxjs/toolkit';
import type {Track} from '../types';
import {DEFAULT_TRACKS} from '../defaultTracks';

export interface PlayerState {
  tracks: Track[];
  currentTrackIndex: number;
  isPlaying: boolean;
  isClipPlaying: boolean;
  currentTime: number;
  duration: number;
}

export const defaultTracks: Track[] = DEFAULT_TRACKS.map(t => ({
  id: t.filename,
  title: t.title,
  artist: 'Unknown Artist',
  duration: 0,
  url: `${import.meta.env.VITE_BASE_URL}music/${t.filename}`,
}));

const initialState: PlayerState = {
  tracks: defaultTracks,
  currentTrackIndex: defaultTracks.length > 0 ? 0 : -1,
  isPlaying: false,
  isClipPlaying: false,
  currentTime: 0,
  duration: 0,
};

export const playerSlice = createSlice({
  name: 'player',
  initialState,
  reducers: {
    setTracks(state, action: PayloadAction<Track[]>) {
      state.tracks = action.payload;
    },
    setCurrentTrackIndex(state, action: PayloadAction<number>) {
      state.currentTrackIndex = action.payload;
    },
    setIsPlaying(state, action: PayloadAction<boolean>) {
      state.isPlaying = action.payload;
    },
    setIsClipPlaying(state, action: PayloadAction<boolean>) {
      state.isClipPlaying = action.payload;
    },
    setCurrentTime(state, action: PayloadAction<number>) {
      state.currentTime = action.payload;
    },
    setDuration(state, action: PayloadAction<number>) {
      state.duration = action.payload;
    },
  },
});

export const {
  setTracks,
  setCurrentTrackIndex,
  setIsPlaying,
  setIsClipPlaying,
  setCurrentTime,
  setDuration,
} = playerSlice.actions;
export default playerSlice.reducer;
