/**
 * Redux store configuration.
 *
 * Combines all app slices into the single store that every component reads via
 * the typed hooks in `store/hooks.ts`.
 */

import {combineReducers, configureStore} from '@reduxjs/toolkit';
import configReducer, {saveConfig, updateConfig} from './configSlice';
import playerReducer from './playerSlice';
import analysisReducer from './analysisSlice';

const reducer = combineReducers({
  config: configReducer,
  player: playerReducer,
  analysis: analysisReducer,
});

export const store = configureStore({
  reducer: (
    state: ReturnType<typeof reducer> | undefined,
    action: Parameters<typeof reducer>[1],
  ) => {
    if (
      (state?.player.isPlaying || state?.player.isClipPlaying) &&
      updateConfig.match(action) &&
      'mergeScope' in action.payload
    ) {
      const allowedChanges = {...action.payload};
      delete allowedChanges.mergeScope;
      if (Object.keys(allowedChanges).length === 0) return state;
      return reducer(state, updateConfig(allowedChanges));
    }
    return reducer(state, action);
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
