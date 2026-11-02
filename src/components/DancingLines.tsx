/**
 * Real-time frequency visualizer: reads live byte-frequency data from a Web
 * Audio AnalyserNode and draws smoothed vertical bars on a canvas. Runs its own
 * rAF loop and never triggers React re-renders.
 *
 * iOS/WebKit cannot route the <audio> element through the Web Audio graph
 * (`createMediaElementSource` desyncs playback, which breaks clip loops), so
 * the analyser is intentionally unavailable there. As a fallback, and whenever
 * playback is paused, the bars are derived from decoded waveform samples
 * around the playhead (a moving energy profile of the actual audio), so the
 * canvas still reflects the current/clicked spot.
 */

import {memo, useEffect, useRef} from 'react';
import type {WaveformData} from '../types';
import {getCssVar} from '../utils/css';
import {startFrameLoop} from '../utils/raf';
import './DancingLines.css';

interface DancingLinesProps {
  getAnalyser?: (resume: boolean) => AnalyserNode | null;
  /** iOS fallback: live playhead time for sample-derived energy. */
  getCurrentTime?: () => number;
  /** iOS fallback: decoded mono samples (full track). */
  waveform?: WaveformData | null;
  /** Redux-confirmed playhead; reflects seeks immediately, while the audio
   *  element's `currentTime` readback lags a seek on some platforms. The
   *  fallback prefers this when playback isn't advancing and the live element
   *  time while it is. */
  currentTime?: number;
  /** Live playback state. The live analyser spectrum only reflects what the
   *  audio graph is currently outputting, so when paused it shows nothing at
   *  the clicked position; the decoded-sample profile is used instead. */
  playing: boolean;
  /** Current theme ID to trigger redraw on theme change. */
  theme?: string;
}

const BAR_COUNT = 56;
const SMOOTHING = 0.2;
const MIN_BAR_HEIGHT_PX = 3;
// How far behind the playhead the energy window trails (needs decoded audio).
// Kept short so the bars react to the current beat/transients instead of a
// long smoothed average (which read as a static picture).
const ENERGY_WINDOW_SEC = 0.32;
const ENERGY_LEAD_SEC = 0.03;

export const DancingLines = memo(
  ({
    getAnalyser,
    getCurrentTime,
    waveform,
    currentTime,
    playing,
    theme,
  }: DancingLinesProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const currentTimeRef = useRef(currentTime);
    currentTimeRef.current = currentTime;
    const playingRef = useRef(playing);
    playingRef.current = playing;
    const prevLiveRef = useRef(-1);

    useEffect(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const levels = new Float32Array(BAR_COUNT);
      let data = new Uint8Array(0);

      return startFrameLoop(() => {
        // Size the backing store to the display box (cls-scaling kept crisp).
        // This CAN'T fight the layout anymore: the strip's box is set purely by
        // CSS `flex: 1 1 0` + width, not by the canvas' intrinsic size.
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const pw = Math.round(rect.width * dpr);
        const ph = Math.round(rect.height * dpr);
        if (canvas.width !== pw || canvas.height !== ph) {
          canvas.width = pw;
          canvas.height = ph;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);
        const cw = rect.width;
        const ch = rect.height;

        const playing = playingRef.current;
        const analyser = playing
          ? getAnalyser
            ? getAnalyser(false)
            : null
          : null;
        if (analyser) {
          // Live spectrum while audio is actually flowing.
          const len = analyser.frequencyBinCount;
          if (data.length !== len) data = new Uint8Array(len);
          analyser.getByteFrequencyData(data);
          for (let i = 0; i < BAR_COUNT; i++) {
            const bin = Math.min(
              len - 1,
              Math.floor((1 - Math.pow(1 - i / BAR_COUNT, 1.5)) * (len - 1)),
            );
            if (len === 0) continue;
            const v = data[bin]! / 255;
            const prev108 = levels[i] ?? 0;
            levels[i] = prev108 + (Math.pow(v, 1.7) - prev108) * SMOOTHING;
          }
        } else if (waveform && getCurrentTime) {
          // Energy profile of the decoded samples at the playhead — the live
          // analyser shows nothing while paused, so this keeps the strip
          // reflecting the clicked/current spot at all times.
          const samples = waveform.data;
          const rate = waveform.sampleRate;
          const live = getCurrentTime();
          const prevLive = prevLiveRef.current;
          prevLiveRef.current = live;
          // Prefer the live element time while it advances, the Redux-confirmed
          // playhead otherwise (or always while paused: it reflects seeks right
          // away, which is exactly what a click on a silent spot needs).
          const t = playing
            ? live > prevLive
              ? live
              : (currentTimeRef.current ?? live)
            : (currentTimeRef.current ?? live);
          const lead = Math.max(0, t - ENERGY_LEAD_SEC);
          const s0 = Math.floor(Math.max(0, lead - ENERGY_WINDOW_SEC) * rate);
          const s1 = Math.min(
            samples.length,
            Math.ceil(Math.max(0, lead) * rate),
          );
          const span = Math.max(1, s1 - s0);
          const perBar = Math.floor(span / BAR_COUNT);
          const stride = Math.max(1, Math.floor(perBar / 4));
          for (let i = 0; i < BAR_COUNT; i++) {
            const a = s0 + i * perBar;
            const b = Math.min(s1, a + perBar);
            let peak = 0;
            for (let s = a; s < b; s += stride) {
              const v = Math.abs(samples[s]!);
              if (v > peak) peak = v;
            }
            // Soft compression keeps stronger passages moving instead of flattening at full height.
            const v = 1 - Math.exp(-Math.pow(peak, 0.55) * 2);
            const prev145 = levels[i] ?? 0;
            levels[i] = prev145 + (v - prev145) * SMOOTHING;
          }
        } else {
          // No analyser and no waveform source: decay bars to rest.
          for (let i = 0; i < BAR_COUNT; i++) {
            const prev = levels[i] ?? 0;
            levels[i] = prev + (0 - prev) * SMOOTHING;
          }
        }

        ctx.globalAlpha = 0.8;
        ctx.fillStyle = getCssVar('--accent');
        const bw = cw / BAR_COUNT;
        const base = ch - 4;
        // Reserve 10% of the strip even at the strongest level.
        const maxH = Math.max(0, ch - 8) * 0.9;
        for (let i = 0; i < BAR_COUNT; i++) {
          const h = Math.max(MIN_BAR_HEIGHT_PX, levels[i]! * maxH);
          const x = i * bw + bw * 0.25;
          ctx.fillRect(x, base - h, bw * 0.5, h);
        }
        ctx.globalAlpha = 1;
      });
    }, [getAnalyser, getCurrentTime, waveform, theme]);

    return <canvas className="row-waveform__dance" ref={canvasRef} />;
  },
);
