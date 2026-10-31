import {describe, expect, it} from 'vitest';
import type {CurrentAudio} from '../types';
import {toCurrentAudio, type CurrentAudioInput} from './selectors';

describe('toCurrentAudio', () => {
  const waveform = {
    data: new Float32Array([0.1, 0.2]),
    sampleRate: 44100,
    duration: 2,
  };

  const cases: Array<[CurrentAudioInput, CurrentAudio]> = [
    [
      {
        track: null,
        waveformStatus: 'idle',
        waveform: null,
        clips: [],
        gaps: [],
        initGap: 0,
        currentTime: 0,
      },
      {
        url: null,
        title: null,
        waveform: null,
        waveformStatus: 'idle',
        clips: [],
        gaps: [],
        initGap: 0,
        currentTime: 0,
      },
    ],
    [
      {
        track: {
          id: 'a',
          title: 'Song A',
          artist: 'Artist',
          duration: 90,
          url: '/a.mp3',
        },
        waveformStatus: 'ready',
        waveform,
        clips: [{start: 0, end: 1, vStart: 0, vEnd: 1}],
        gaps: [1, 2.5],
        initGap: 1,
        currentTime: 12.5,
      },
      {
        url: '/a.mp3',
        title: 'Song A',
        waveform,
        waveformStatus: 'ready',
        clips: [{start: 0, end: 1, vStart: 0, vEnd: 1}],
        gaps: [1, 2.5],
        initGap: 1,
        currentTime: 12.5,
      },
    ],
  ];

  it.each(cases)('maps the state into CurrentAudio %#', (input, expected) => {
    expect(toCurrentAudio(input)).toEqual(expected);
  });
});
