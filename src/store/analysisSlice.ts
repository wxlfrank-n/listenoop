/**
 * Redux slice for decoded/analyzed audio of the current track.
 *
 * A side-effect hook (`useWaveform`) decodes the current track's samples and
 * stores them here; `App` derives silence-split clips from that waveform and
 * stores them too. Kept separate from `player` so decode/analysis can update at
 * its own cadence without churning playback state.
 */

import {createSlice} from '@reduxjs/toolkit';
import type {PayloadAction} from '@reduxjs/toolkit';
import type {WaveformData, WaveformStatus} from '../types';
import type {Clip} from '../utils/clips';

export interface AnalysisState {
  waveform: WaveformData | null;
  waveformStatus: WaveformStatus;
  clips: Clip[];
  gaps: number[];
  initGap: number;
}

const initialState: AnalysisState = {
  waveform: null,
  waveformStatus: 'idle',
  clips: [],
  gaps: [],
  initGap: 0,
};

export const analysisSlice = createSlice({
  name: 'analysis',
  initialState,
  reducers: {
    setWaveform(state, action: PayloadAction<WaveformData | null>) {
      state.waveform = action.payload;
    },
    setWaveformStatus(state, action: PayloadAction<WaveformStatus>) {
      state.waveformStatus = action.payload;
    },
    setClips(
      state,
      action: PayloadAction<{clips: Clip[]; gaps: number[]; initGap: number}>,
    ) {
      state.clips = action.payload.clips;
      state.gaps = action.payload.gaps;
      state.initGap = action.payload.initGap;
    },
  },
});

export const {setWaveform, setWaveformStatus, setClips} = analysisSlice.actions;
export default analysisSlice.reducer;
