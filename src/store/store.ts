/**
 * Redux store configuration.
 *
 * Combines all app slices into the single store that every component reads via
 * the typed hooks in `store/hooks.ts`.
 */

import {configureStore} from '@reduxjs/toolkit';
import configReducer, {saveConfig} from './configSlice';
import playerReducer from './playerSlice';
import analysisReducer from './analysisSlice';

export const store = configureStore({
  reducer: {
    config: configReducer,
    player: playerReducer,
    analysis: analysisReducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: {
        // The decoded waveform holds a Float32Array of sample amplitudes; it
        // lives only in memory and is never serialized/persisted.
        ignoredPaths: ['analysis.waveform', 'player.tracks'],
        ignoredActionPaths: ['payload.data'],
      },
    }),
});

let lastConfig = store.getState().config;
store.subscribe(() => {
  const config = store.getState().config;
  if (config !== lastConfig) {
    lastConfig = config;
    saveConfig(config);
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
