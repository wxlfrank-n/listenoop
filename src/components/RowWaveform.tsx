import {memo, useMemo, useRef} from 'react';
import {Clips} from './Clips';
import {ClipLabel, clipLabelProps} from './ClipLabel';
import {DancingLines} from './DancingLines';
import {WaveformCursor} from './WaveformCursor';
import {WaveformCanvas} from './Waveform';
import {type WaveformData} from '../hooks/useWaveform';
import {useRowWaveformScroll, VB_W, VB_H} from '../hooks/useRowWaveformScroll';
import {useClipPlayRequest} from '../hooks/useClipPlayRequest';
import {useClipPinchMerge} from '../hooks/useClipPinchMerge';
import {useConfig} from '../hooks/useConfig';
import {useWaveformKeyboard} from '../hooks/useWaveformKeyboard';
import {useT} from '../i18n';
import type {Clip as InitClipData} from '../utils/clips';
import type {ClipPlayRequest, SwipeDirection} from '../types';
import './RowWaveform.css';

const PAD = 4;

export interface RowWaveformProps {
  waveform: WaveformData;
  displayClips: InitClipData[];
  currentTime: number;
  onSeek: (time: number) => void;
  onPlayRange: (
    start: number,
    end: number,
    repetitions: number,
    onComplete?: () => void,
  ) => void;
  repetitions: number;
  onStopPlayback?: () => void;
  activeClip: number;
  onActiveClipChange: (idx: number) => void;
  onSwipeClip?: (idx: number, direction: SwipeDirection) => void;
  /** Minimum seconds a split must leave on each side; controls the affordance. */
  minSplitPieceSec?: number;
  /** Pinching two clips together merges the clip range between them. */
  onPinchMergeClip?: (lowIndex: number, highIndex: number) => void;
  /** Spreading two fingers apart on one clip splits that clip normally. */
  onPinchSplitClip?: (idx: number) => void;
  getAnalyser?: (resume: boolean) => AnalyserNode | null;
  getCurrentTime: () => number;
  playing: boolean;
  scrolling: boolean;
  setScrolling: React.Dispatch<React.SetStateAction<boolean>>;
  scrollTimeoutRef: React.RefObject<number | undefined>;
  clipPlayRequest?: ClipPlayRequest;
}

export const RowWaveform = memo(
  ({
    waveform,
    displayClips,
    currentTime,
    onSeek,
    onPlayRange,
    repetitions,
    onStopPlayback,
    activeClip,
    onActiveClipChange,
    onSwipeClip,
    minSplitPieceSec,
    onPinchMergeClip,
    onPinchSplitClip,
    getAnalyser,
    getCurrentTime,
    playing,
    scrolling,
    setScrolling,
    scrollTimeoutRef,
    clipPlayRequest,
  }: RowWaveformProps) => {
    const innerH = VB_H - PAD * 2;
    const cursorElRef = useRef<HTMLDivElement>(null);
    const playedElRef = useRef<HTMLDivElement>(null);
    const clipLabelLayerRef = useRef<HTMLDivElement>(null);
    const {config} = useConfig();
    const theme = config.theme;
    const t = useT();
    const onKeyDown = useWaveformKeyboard({
      duration: waveform.duration,
      getCurrentTime,
      onSeek,
      skipSeconds: config.skipSeconds,
    });
    const {
      hsRef,
      trackRef,
      hsWinLenRef,
      renderedBufferAnchor,
      bufferLengthRef,
      onHsPointerDown,
      onRootClickCapture,
      onWaveformClick,
      getStripPlayedPct,
      playClip,
    } = useRowWaveformScroll({
      waveformDuration: waveform.duration,
      currentTime,
      onSeek,
      onPlayRange,
      repetitions,
      onStopPlayback,
      onActiveClipChange,
      onSwipeClip,
      getCurrentTime,
      playing,
      scrolling,
      setScrolling,
      scrollTimeoutRef,
      cursorElRef,
      playedElRef,
      clipLabelLayerRef,
      // On mount (including a view switch from stacked → single-row), open
      // the viewport at the active clip's midpoint so the user keeps seeing
      // the clip they were working on. With no active clip, fall back to the
      // playhead so the viewport tracks the current playback position
      // instead of jumping to 0. Empty deps: this is a MOUNT-TIME value —
      // subsequent anchor changes go through the normal follow/seek flow.
      initialAnchorSec: useMemo(() => {
        if (activeClip >= 0) {
          const clip = displayClips[activeClip];
          if (clip) return (clip.vStart + clip.vEnd) / 2;
        }
        return currentTime;
      }, []),
    });
    /*
     A split/merge changes which clip should be playing. The parent describes
     that as data (`clipPlayRequest`); this view is the only place that can
     arm its own playback context, so it reacts here instead of the parent
     reaching in through a handle.
     */
    useClipPlayRequest(clipPlayRequest, playClip);

    /*
     * Two-finger "snip" gestures, detected on the track element that contains
     * every clip: two clips squeezed together merge the range between them,
     * two fingers spread apart on one clip split it normally. The horizontal
     * pan stands down via `clipPinchState`.
     */
    const {onPointerDown: onPinchPointerDown} = useClipPinchMerge(
      onPinchMergeClip,
      onPinchSplitClip,
    );

    const bufferLen = bufferLengthRef.current;
    const bufferScale = bufferLen > 0 ? hsWinLenRef.current / bufferLen : 1;
    const vbW = VB_W * bufferScale;
    // Memoized so the memoized `WaveformCanvas` children (and `Clips`) don't
    // see a new object identity on every parent re-render — which would
    // defeat their memo and re-run the canvas draw effect each time.
    const waveformWindow = useMemo(
      () => ({
        windowStartSec: renderedBufferAnchor,
        windowLen: bufferLen,
        innerH,
        vbW,
        vbH: VB_H,
      }),
      [renderedBufferAnchor, bufferLen, innerH, vbW],
    );
    // Static per-mount: no reactive inputs, so allocate once.
    const canvasStyle: React.CSSProperties = useMemo(
      () => ({
        position: 'absolute' as const,
        inset: 0,
        width: '100%',
        height: '100%',
      }),
      [],
    );

    return (
      <div
        className="row-waveform"
        ref={hsRef}
        role="slider"
        tabIndex={0}
        aria-label={t('waveform.ariaLabel')}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, waveform.duration)}
        aria-valuenow={currentTime}
        onPointerDown={onHsPointerDown}
        onClickCapture={onRootClickCapture}
        onKeyDown={onKeyDown}
      >
        <div className="row-waveform__inner">
          <DancingLines
            getAnalyser={getAnalyser}
            getCurrentTime={getCurrentTime}
            waveform={waveform}
            currentTime={currentTime}
            playing={playing}
            theme={theme}
          />
          <div
            className="row-waveform__track"
            ref={trackRef}
            onClick={onWaveformClick}
            onPointerDown={onPinchPointerDown}
          >
            <WaveformCanvas
              className="row-waveform__svg"
              data={waveform.data}
              sampleRate={waveform.sampleRate}
              window={waveformWindow}
              strokeWidth={1.6}
              style={canvasStyle}
              theme={theme}
            />
            <div
              ref={playedElRef}
              className="row-waveform__played"
              style={{
                position: 'absolute',
                inset: 0,
                overflow: 'hidden',
                pointerEvents: 'none',
                clipPath: 'inset(0 100% 0 0)',
              }}
            >
              <WaveformCanvas
                className="row-waveform__svg row-waveform__svg--played"
                data={waveform.data}
                sampleRate={waveform.sampleRate}
                window={waveformWindow}
                strokeWidth={1.6}
                colorVar="--waveform-bar-played"
                style={canvasStyle}
                theme={theme}
              />
            </div>
            <div
              ref={clipLabelLayerRef}
              className="row-waveform__clip-layer"
              style={{position: 'absolute', inset: 0, width: '100%'}}
            >
              <Clips
                clips={displayClips}
                window={waveformWindow}
                onPlayRange={playClip}
                repetitions={repetitions}
                playing={playing}
                onStopPlayback={onStopPlayback}
                activeClip={activeClip}
                onActivate={onActiveClipChange}
                onSwipe={onSwipeClip}
                minSplitPieceSec={minSplitPieceSec}
                renderLabel={(id, c) => (
                  <div
                    key={`hlbl-${id}`}
                    data-row-clip-label
                    data-clip-start={c.start}
                    data-clip-end={c.end}
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <ClipLabel
                      {...clipLabelProps({
                        id,
                        clip: c,
                        activeClip,
                      })}
                    />
                  </div>
                )}
              />
            </div>
            <WaveformCursor
              view="row"
              getPlayedPct={getStripPlayedPct}
              getCurrentTime={getCurrentTime}
              cursorRef={cursorElRef}
            />
          </div>
        </div>
      </div>
    );
  },
);
