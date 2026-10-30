import {memo, useCallback, useEffect, useRef} from 'react';
import type {CSSProperties} from 'react';
import type {WaveWindow} from '../types';

interface WaveformCanvasProps {
  data: Float32Array;
  sampleRate: number;
  window: WaveWindow;
  contentEndSec?: number;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
  /** Overrides normal and silent waveform colors. */
  color?: string;
  /**
   * CSS custom property to read for the override color at draw time (e.g.
   * `--waveform-bar-played`). Resolved inside `draw()` so theme changes
   * apply — a value captured during render would be stale, because the
   * ThemeProvider writes the new variables in its own effect afterwards.
   */
  colorVar?: string;
  /** Distance between waveform bars in CSS pixels. */
  barSpacing?: number;
  /** Current theme ID to trigger redraw on theme change. */
  theme?: string;
}

const MIN_BAR_PX = 2;

/** Reusable draw buffers so per-frame rAF redraws don't heap-allocate. */
interface DrawBuffers {
  size: number;
  top: Float64Array;
  bot: Float64Array;
  topSm: Float64Array;
  botSm: Float64Array;
}

/** Cached computed colors, invalidated when theme/color/colorVar change. */
interface ColorCache {
  key: string;
  base: string;
  silent: string;
}

export const WaveformCanvas = memo(
  ({
    data,
    sampleRate,
    window,
    contentEndSec,
    className,
    style,
    strokeWidth = 1,
    color,
    colorVar,
    barSpacing = 3,
    theme,
  }: WaveformCanvasProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // Buffers grow geometrically; the largest view width determines steady-
    // state size, after which zero allocations happen per redraw.
    const drawBufsRef = useRef<DrawBuffers | null>(null);
    // `getComputedStyle` forces style resolution — calling it every rAF
    // redraw triggers a layout pass. Colors only change with theme/color
    // props (both in `draw`'s dep array), so cache by that key and refresh
    // the cache at most once per change.
    const colorCacheRef = useRef<ColorCache | null>(null);
    const {
      windowStartSec: bufferStartSec,
      windowLen: bufferLen,
      innerH,
      vbH,
    } = window;

    const draw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (cssW <= 0 || cssH <= 0) return;

      const dpr = Math.max(1, globalThis.devicePixelRatio || 1);
      const bw = Math.max(1, Math.round(cssW * dpr));
      const bh = Math.max(1, Math.round(cssH * dpr));

      if (canvas.width !== bw) canvas.width = bw;
      if (canvas.height !== bh) canvas.height = bh;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      if (data.length === 0 || bufferLen <= 0 || sampleRate <= 0) return;

      // Keep the same sparse visual density on desktop and mobile:
      // one bar every `barSpacing` CSS pixels.
      const spacingPx = Math.max(1, barSpacing);
      const durationPerPixel = bufferLen / cssW;
      const durationPerBar = durationPerPixel * spacingPx;
      const step = Math.max(1, Math.round(durationPerBar * sampleRate));

      const bufferStartSample = Math.max(
        0,
        Math.floor(bufferStartSec * sampleRate),
      );
      const latticeStart = Math.floor(bufferStartSample / step) * step;
      const bufferEndSample = Math.min(
        data.length,
        Math.ceil((bufferStartSec + bufferLen) * sampleRate),
      );

      const contentEndSample =
        contentEndSec !== undefined
          ? Math.min(
              bufferEndSample,
              Math.max(
                bufferStartSample,
                Math.floor(contentEndSec * sampleRate),
              ),
            )
          : bufferEndSample;

      const frames = Math.max(
        1,
        Math.min(
          Math.ceil(cssW / spacingPx) + 1,
          Math.ceil((bufferEndSample - latticeStart) / step),
        ),
      );

      const midY = vbH / 2;
      const scaleY = innerH / 2;

      // Colors: resolve via getComputedStyle only when the cache key
      // (theme + color props) differs from the last draw.
      const cacheKey = `${theme ?? ''}|${color ?? ''}|${colorVar ?? ''}`;
      let baseColor: string;
      let silentColor: string;
      const cachedColors = colorCacheRef.current;
      if (cachedColors && cachedColors.key === cacheKey) {
        baseColor = cachedColors.base;
        silentColor = cachedColors.silent;
      } else {
        const cs = getComputedStyle(canvas);
        const override =
          color ||
          (colorVar ? cs.getPropertyValue(colorVar).trim() : '') ||
          undefined;
        baseColor =
          override || cs.getPropertyValue('--waveform-bar').trim() || '#8f96a0';
        silentColor =
          override ||
          cs.getPropertyValue('--waveform-bar-silent').trim() ||
          '#434a53';
        colorCacheRef.current = {
          key: cacheKey,
          base: baseColor,
          silent: silentColor,
        };
      }

      // Buffers: (re)allocate only when the visible frame count grows.
      let bufs = drawBufsRef.current;
      if (!bufs || bufs.size < frames) {
        const newSize = Math.max(frames, bufs ? bufs.size * 2 : 256);
        bufs = {
          size: newSize,
          top: new Float64Array(newSize),
          bot: new Float64Array(newSize),
          topSm: new Float64Array(newSize),
          botSm: new Float64Array(newSize),
        };
        drawBufsRef.current = bufs;
      }

      let count = 0;
      for (let frame = 0; frame < frames; frame++) {
        const s0 = latticeStart + frame * step;
        if (s0 >= contentEndSample) break;

        const readStart = Math.max(s0, bufferStartSample);
        const readEnd = Math.min(contentEndSample, s0 + step);
        if (readStart >= readEnd) continue;

        let min = data[readStart]!;
        let max = min;

        for (let sample = readStart + 1; sample < readEnd; sample++) {
          const value = data[sample]!;
          if (value < min) min = value;
          if (value > max) max = value;
        }

        bufs.top[count] = midY - max * scaleY;
        bufs.bot[count] = midY - min * scaleY;
        count++;
      }

      // 3-tap [1 2 1]/4 smoothing, written into the sibling buffers.
      for (let i = 0; i < count; i++) {
        const lt = bufs.top[Math.max(0, i - 1)]!;
        const ct = bufs.top[i]!;
        const rt = bufs.top[Math.min(count - 1, i + 1)]!;
        bufs.topSm[i] = (lt + 2 * ct + rt) / 4;

        const lb = bufs.bot[Math.max(0, i - 1)]!;
        const cb = bufs.bot[i]!;
        const rb = bufs.bot[Math.min(count - 1, i + 1)]!;
        bufs.botSm[i] = (lb + 2 * cb + rb) / 4;
      }

      const sy = cssH / vbH;

      // Stroke the two bar classes in separate passes over the reusable
      // buffers — no per-draw Segment objects.
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      let strokedWave = false;
      for (let i = 0; i < count; i++) {
        const top = bufs.topSm[i]!;
        const bottom = bufs.botSm[i]!;
        const height = (bottom - top) * sy;
        if (height >= MIN_BAR_PX) {
          const x = i * spacingPx;
          ctx.moveTo(x, top * sy);
          ctx.lineTo(x, bottom * sy);
          strokedWave = true;
        }
      }
      if (strokedWave) ctx.stroke();

      ctx.strokeStyle = silentColor;
      ctx.beginPath();
      let strokedSilent = false;
      for (let i = 0; i < count; i++) {
        const top = bufs.topSm[i]!;
        const bottom = bufs.botSm[i]!;
        const height = (bottom - top) * sy;
        if (height < MIN_BAR_PX) {
          const x = i * spacingPx;
          const mid = ((top + bottom) / 2) * sy;
          const half = MIN_BAR_PX / 2;
          ctx.moveTo(x, mid - half);
          ctx.lineTo(x, mid + half);
          strokedSilent = true;
        }
      }
      if (strokedSilent) ctx.stroke();
    }, [
      data,
      sampleRate,
      bufferStartSec,
      bufferLen,
      innerH,
      vbH,
      contentEndSec,
      strokeWidth,
      color,
      colorVar,
      barSpacing,
      theme,
    ]);

    useEffect(() => {
      draw();
      const canvas = canvasRef.current;
      if (!canvas || typeof ResizeObserver === 'undefined') return;

      const observer = new ResizeObserver(() => draw());
      observer.observe(canvas);
      return () => observer.disconnect();
    }, [draw]);

    return <canvas ref={canvasRef} className={className} style={style} />;
  },
);
