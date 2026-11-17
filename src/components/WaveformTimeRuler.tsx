import {memo} from 'react';
import {formatTime} from '../utils/format';
import type {WaveWindow} from '../types';
import './WaveformTimeRuler.css';

interface WaveformTimeRulerProps {
  window: WaveWindow;
  contentEndSec: number;
}

export const WaveformTimeRuler = memo(function WaveformTimeRuler({
  window: {windowStartSec, windowLen},
  contentEndSec,
}: WaveformTimeRulerProps) {
  if (windowLen <= 0) return null;
  const end = Math.min(contentEndSec, windowStartSec + windowLen);
  if (end <= windowStartSec) return null;

  const ticks = [];
  for (let second = Math.ceil(windowStartSec); second <= end; second++) {
    const left = (second - windowStartSec) / windowLen;
    const edge =
      second - windowStartSec < 0.5 ? 'start' : end - second < 0.5 ? 'end' : '';
    ticks.push(
      <span
        key={second}
        className="waveform-time-ruler__tick"
        data-second={second}
        data-edge={edge}
        data-even={second % 2 === 0}
        data-five={second % 5 === 0}
        data-ten={second % 10 === 0}
        style={{left: `${left * 100}%`, width: `${100 / windowLen}%`}}
      >
        <span className="waveform-time-ruler__mark" />
        <span className="waveform-time-ruler__label">{formatTime(second)}</span>
      </span>,
    );
  }

  return (
    <div className="waveform-time-ruler" aria-hidden="true">
      <span
        className="waveform-time-ruler__line"
        style={{width: `${((end - windowStartSec) / windowLen) * 100}%`}}
      />
      {ticks}
    </div>
  );
});
