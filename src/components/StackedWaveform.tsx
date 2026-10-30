/**
 * Stacked waveform view - each clip group renders as a fixed-height row of
 * bars, arranged in horizontally scrollable pages.
 *
 * Gesture ownership:
 * - tap on clip       -> select/play clip
 * - vertical swipe    -> split/merge clip
 * - horizontal drag   -> page navigation
 *
 * Horizontal page dragging is owned by this component rather than Clip.
 * This allows a page drag to begin anywhere, including directly on a clip.
 */

import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useDrag} from '@use-gesture/react';

import {StackRow, type StackedRow} from './StackRow';
import {clipPinchState} from './clipPinch';
import {clipGestureLedger} from './clipPinch';
import {DIAGONAL_MIN_TAN} from './Clip';

import {
  type ClipPlayRequest,
  type SwipeDirection,
  type WaveformData,
} from '../types';
import type {Clip as InitClipData} from '../utils/clips';
import {startFrameLoop} from '../utils/raf';
import {addListener} from '../utils/listener';
import {useClipPlayRequest} from '../hooks/useClipPlayRequest';
import {useClipPinchMerge} from '../hooks/useClipPinchMerge';
import {useConfig} from '../hooks/useConfig';
import {useWaveformKeyboard} from '../hooks/useWaveformKeyboard';
import {useT} from '../i18n';
import './StackedWaveform.css';
import {getWindowSecs} from '../utils/rowWaveform';

const ROW_H = 64;
const ROW_GAP = 4;

const HORIZONTAL_DRAG_THRESHOLD = 8;

interface StackedWaveformProps {
  waveform: WaveformData;

  displayClips: InitClipData[];

  currentTime: number;

  playing: boolean;

  activeClip: number;

  repetitions: number;

  onStopPlayback?: () => void;

  onSwipeClip?: (idx: number, direction: SwipeDirection) => void;

  /** Minimum seconds a split must leave on each side; controls the affordance. */
  minSplitPieceSec?: number;

  /**
   * Two clips pinched together (fingers squeeze inward across the range) merges
   * every clip between them. Reports the two global clip indices, ordered.
   */
  onPinchMergeClip?: (lowIndex: number, highIndex: number) => void;

  /**
   * Two fingers spread apart on a single clip splits that clip normally.
   * Reports the global clip index.
   */
  onPinchSplitClip?: (idx: number) => void;

  onSeek: (time: number) => void;

  onActiveClipChange: (idx: number) => void;

  onPlayRange: (
    start: number,
    end: number,
    repetitions: number,
    onComplete?: () => void,
  ) => void;

  getCurrentTime: () => number;

  clipPlayRequest?: ClipPlayRequest;
}

type StackedRowEntry = {
  row: StackedRow;
  gi: number;
};

interface PageDrag {
  startScrollLeft: number;
  locked: boolean;
}

export const StackedWaveform = memo(
  ({
    waveform,
    displayClips,
    currentTime,
    playing,
    activeClip,
    repetitions,
    onStopPlayback,
    onSwipeClip,
    minSplitPieceSec,
    onPinchMergeClip,
    onPinchSplitClip,
    onSeek,
    onActiveClipChange,
    onPlayRange,
    getCurrentTime,
    clipPlayRequest,
  }: StackedWaveformProps) => {
    const scrollerRef = useRef<HTMLDivElement>(null);
    const [scrollerWidth, setScrollerWidth] = useState(0);
    const {config} = useConfig();
    const t = useT();
    const onKeyDown = useWaveformKeyboard({
      duration: waveform.duration,
      getCurrentTime,
      onSeek,
      skipSeconds: config.skipSeconds,
    });
    /*
     * =========================================================
     * ROWS
     * =========================================================
     */

    const windowSecs = useMemo(
      () => getWindowSecs(scrollerWidth),
      [scrollerWidth],
    );

    const stackedRows = useMemo<StackedRow[]>(() => {
      const rows: StackedRow[] = [];

      let cur: StackedRow | null = null;

      displayClips.forEach((clip, idx) => {
        const duration = clip.vEnd - clip.vStart;

        if (!cur || duration + (cur.end - cur.start) <= windowSecs) {
          if (!cur) {
            cur = {
              start: clip.vStart,
              end: clip.vEnd,
              clips: [],
            };
          }

          cur.end = clip.vEnd;

          cur.clips.push({
            clip,
            idx,
          });
        } else {
          rows.push(cur);

          cur = {
            start: clip.vStart,
            end: clip.vEnd,
            clips: [
              {
                clip,
                idx,
              },
            ],
          };
        }
      });

      if (cur) {
        rows.push(cur);
      }

      if (rows.length > 0) {
        /*
         * First row represents the beginning of
         * the waveform even if the first detected
         * clip starts slightly later.
         */
        rows[0]!.start = 0;

        /*
         * Last row reaches the physical end of
         * the audio.
         */
        const lastRow = rows[rows.length - 1]!;
        lastRow.end = Math.max(lastRow.end, waveform.duration);
      }

      return rows;
    }, [displayClips, windowSecs]);

    /*
     * =========================================================
     * SCROLLER STATE
     * =========================================================
     */

    const pendingAutoScrollRef = useRef(false);

    const autoScrollResetRef = useRef<number | undefined>(undefined);

    const currentPageRef = useRef(-1);

    // Tracks whether the active-clip follow effect has run at least once
    // for this view instance. The first run corresponds to mount (or a
    // view switch from single-row); it uses `behavior: 'auto'` (instant)
    // so the scroll snaps cleanly to the target page instead of being
    // interrupted mid-animation by `scroll-snap-type: x mandatory`.
    const activeClipFirstRunRef = useRef(true);

    const previousTimeRef = useRef(currentTime);

    const userScrollTimerRef = useRef<number | undefined>(undefined);

    /*
     * If the user manually browses during playback,
     * automatic following pauses until playback
     * catches up again.
     */
    const manualOverrideRef = useRef(false);

    const playingRef = useRef(playing);

    /*
     * Pointer state for horizontal page dragging.
     */
    const dragRef = useRef<PageDrag | null>(null);

    /*
     * Prevent a completed page drag from turning
     * into a seek click on the row underneath.
     */
    const suppressRowClickRef = useRef(false);

    useEffect(() => {
      playingRef.current = playing;
    }, [playing]);

    const [containerH, setContainerH] = useState(0);

    const [userScrolling, setUserScrolling] = useState(false);

    const [viewPage, setViewPage] = useState(0);

    const [clipPlayActive, setClipPlayActive] = useState(false);

    /*
     * =========================================================
     * CONTAINER SIZE
     * =========================================================
     */

    useEffect(() => {
      const el = scrollerRef.current;

      if (!el) return;

      const update = () => {
        setContainerH(el.clientHeight);
        setScrollerWidth(el.clientWidth);
      };

      update();

      const observer = new ResizeObserver(update);

      observer.observe(el);

      return () => {
        observer.disconnect();
      };
    }, []);

    const rowGap = useMemo(
      () =>
        containerH
          ? Math.min(24, Math.max(ROW_GAP, Math.floor(containerH / 45)))
          : ROW_GAP,
      [containerH],
    );

    const rowsPerPage = useMemo(() => {
      if (!containerH) {
        return 1;
      }

      return Math.max(1, Math.floor(containerH / (ROW_H + rowGap)));
    }, [containerH, rowGap]);

    /*
     * =========================================================
     * PAGES
     * =========================================================
     */

    const pagedRows = useMemo<StackedRowEntry[][]>(() => {
      const pages: StackedRowEntry[][] = [];

      for (let i = 0; i < stackedRows.length; i += rowsPerPage) {
        pages.push(
          stackedRows.slice(i, i + rowsPerPage).map((row, r) => ({
            row,
            gi: i + r,
          })),
        );
      }

      return pages;
    }, [stackedRows, rowsPerPage]);

    const pageTimes = useMemo(
      () =>
        pagedRows.map(page => ({
          start: page[0]?.row.start ?? 0,

          end: page[page.length - 1]?.row.end ?? 0,
        })),
      [pagedRows],
    );

    const pageTimesRef = useRef(pageTimes);

    useEffect(() => {
      pageTimesRef.current = pageTimes;
    }, [pageTimes]);

    /*
     * =========================================================
     * PAGE HELPERS
     * =========================================================
     */

    const clampPage = useCallback(
      (page: number) => {
        if (pagedRows.length === 0) {
          return 0;
        }

        return Math.max(0, Math.min(pagedRows.length - 1, page));
      },
      [pagedRows.length],
    );

    const scrollToPage = useCallback(
      (page: number, behavior: ScrollBehavior = 'smooth') => {
        const el = scrollerRef.current;

        if (!el) return;

        const target = clampPage(page);

        pendingAutoScrollRef.current = true;

        window.clearTimeout(autoScrollResetRef.current);

        autoScrollResetRef.current = window.setTimeout(() => {
          pendingAutoScrollRef.current = false;
        }, 1000);

        el.scrollTo({
          left: target * el.clientWidth,

          behavior,
        });
      },
      [clampPage],
    );

    const pageForTime = useCallback((time: number) => {
      const pages = pageTimesRef.current;

      if (!pages.length) {
        return 0;
      }

      const last = pages.length - 1;

      if (time < pages[0]!.start) {
        return 0;
      }

      if (time >= pages[last]!.end) {
        return last;
      }

      for (let i = 0; i < pages.length; i++) {
        if (time < pages[i]!.end) {
          return i;
        }
      }

      return last;
    }, []);

    /*
     * =========================================================
     * HORIZONTAL POINTER DRAG
     *
     * The parent observes every pointer gesture, including
     * gestures that START on a clip.
     *
     * The pointer is never captured on pointer-down
     * (`pointer: {capture: false}`); the library tracks the whole
     * gesture through window listeners instead.
     *
     * First we determine direction:
     *
     *     vertical   -> Clip owns it
     *     horizontal -> page scroller owns it
     *
     * This is the key fix.
     * =========================================================
     */

    /*
     * Two-finger "snip" gestures (two clips squeezed together merge the range
     * between them; two fingers spread apart on one clip split it normally).
     * Detected on the scroller so it can span rows; it stands the page drag
     * down via `clipPinchState`.
     */
    const pinchBind = useClipPinchMerge(onPinchMergeClip, onPinchSplitClip);

    const bindPageDrag = useDrag(
      ({first, last, event, initial}) => {
        const el = scrollerRef.current;

        if (!el) return;

        /*
         * A two-finger clip pinch is in progress: stand down so the squeeze is
         * not mistaken for horizontal navigation. Whatever the drag had
         * recorded is abandoned.
         */
        if (clipPinchState.active) {
          dragRef.current = null;

          return;
        }

        /*
         * The clip latched a swipe direction: the page drag must stand down so
         * the viewport cannot scroll away while the clip gesture is in
         * progress. The drag state is dropped, so a later release cannot snap
         * the page.
         */
        if (clipGestureLedger.clipSwipeLocked) {
          if (last) {
            dragRef.current = null;
          }

          return;
        }

        if (first) {
          dragRef.current = {
            startScrollLeft: el.scrollLeft,
            locked: false,
          };

          return;
        }

        const drag = dragRef.current;

        if (!drag) return;

        /*
         * Use the pointer position of the current event rather than the
         * accumulated `movement`: a fast gesture may deliver its releasing
         * event at a new position without an intermediate pointermove, and
         * use-gesture accumulates movement only on pointermove.
         */
        const pointer = event as PointerEvent;

        const dx = pointer.clientX - initial[0];

        const dy = pointer.clientY - initial[1];

        /*
         * Direction has not yet been decided.
         */
        if (!drag.locked) {
          if (
            Math.abs(dx) < HORIZONTAL_DRAG_THRESHOLD &&
            Math.abs(dy) < HORIZONTAL_DRAG_THRESHOLD
          ) {
            return;
          }

          /*
           * Clip gesture: vertical swipe, or a diagonal 15-75 degree swipe.
           *
           * Leave it alone so Clip can interpret it. Page dragging only
           * engages for gestures staying within 15 degrees of the horizontal.
           */
          if (Math.abs(dy) >= DIAGONAL_MIN_TAN * Math.abs(dx)) {
            if (last) {
              dragRef.current = null;
            }

            return;
          }

          drag.locked = true;

          suppressRowClickRef.current = true;

          setUserScrolling(true);

          if (playingRef.current) {
            manualOverrideRef.current = true;
          }
        }

        /*
         * Natural touch paging:
         *
         * finger moves left  -> content moves left
         *                      -> next page
         *
         * finger moves right -> previous page
         */
        el.scrollLeft = drag.startScrollLeft - dx;

        if (!last) {
          return;
        }

        dragRef.current = null;

        const pageWidth = Math.max(1, el.clientWidth);

        const page = clampPage(Math.round(el.scrollLeft / pageWidth));

        currentPageRef.current = page;

        setViewPage(page);

        /*
         * This is a USER initiated snap.
         *
         * Do not use scrollToPage(), because that helper
         * marks the movement as an automatic scroll.
         */
        el.scrollTo({
          left: page * pageWidth,

          behavior: 'smooth',
        });

        window.clearTimeout(userScrollTimerRef.current);

        userScrollTimerRef.current = window.setTimeout(() => {
          setUserScrolling(false);
        }, 500);
      },
      {
        pointer: {capture: false, keys: false},
      },
    );

    /*
     * The page drag binds `onPointerDown` on the scroller; the pinch needs the
     * same event, so resolve both handlers here and merge them in the JSX.
     */
    const pageDragBind = bindPageDrag();

    const {onPointerDown: pageDragPointerDown, ...pageDragRest} = pageDragBind;

    /*
     * =========================================================
     * NATIVE SCROLL EVENTS
     * =========================================================
     */

    useEffect(() => {
      const el = scrollerRef.current;

      if (!el) return;

      const onScroll = () => {
        /*
         * Programmatic auto-follow scroll.
         */
        if (pendingAutoScrollRef.current) {
          return;
        }

        window.clearTimeout(userScrollTimerRef.current);

        setUserScrolling(true);

        const idx = clampPage(
          Math.round(el.scrollLeft / Math.max(1, el.clientWidth)),
        );

        currentPageRef.current = idx;

        setViewPage(idx);

        if (playingRef.current) {
          manualOverrideRef.current = true;
        }

        userScrollTimerRef.current = window.setTimeout(() => {
          setUserScrolling(false);
        }, 1500);
      };

      const stopScrollListener = addListener(el, 'scroll', onScroll, {
        passive: true,
      });

      return () => {
        stopScrollListener();

        window.clearTimeout(userScrollTimerRef.current);

        window.clearTimeout(autoScrollResetRef.current);
      };
    }, [clampPage]);

    /*
     * =========================================================
     * PLAYBACK AUTO-FOLLOW
     * =========================================================
     */

    useEffect(() => {
      return startFrameLoop(() => {
        if (!playing || userScrolling) {
          return;
        }

        const time = getCurrentTime();

        if (!Number.isFinite(time)) {
          return;
        }

        const page = pageForTime(time);

        if (page === currentPageRef.current) {
          manualOverrideRef.current = false;

          return;
        }

        if (page > currentPageRef.current && !manualOverrideRef.current) {
          currentPageRef.current = page;

          setViewPage(page);

          scrollToPage(page);
        }
      });
    }, [playing, userScrolling, pageForTime, scrollToPage, getCurrentTime]);

    /*
     * =========================================================
     * EXPLICIT SEEK
     * =========================================================
     */

    useEffect(() => {
      const previousTime = previousTimeRef.current;

      previousTimeRef.current = currentTime;

      if (Math.abs(currentTime - previousTime) < 1) {
        return;
      }

      const page = pageForTime(currentTime);

      if (playing && page > currentPageRef.current) {
        return;
      }

      if (clipPlayActive && page < currentPageRef.current) {
        return;
      }

      if (page === currentPageRef.current) {
        return;
      }

      currentPageRef.current = page;

      setViewPage(page);

      scrollToPage(page);
    }, [currentTime, pageForTime, playing, clipPlayActive, scrollToPage]);

    /*
     * Reset manual override when playback state or
     * waveform structure changes.
     */
    useEffect(() => {
      manualOverrideRef.current = false;
    }, [playing, stackedRows]);

    /*
     * =========================================================
     * ACTIVE CLIP FOLLOW
     * =========================================================
     */

    useEffect(() => {
      if (activeClip < 0) {
        return;
      }

      const clip = displayClips[activeClip];

      if (!clip) return;

      /*
       * A split or merge re-packs the rows, so the edited clip can land on
       * another page. Follow it there: the clip the user is working on must
       * stay on screen. When it is already on the visible page nothing moves.
       *
       * On the FIRST run (mount / view switch from single-row), scroll
       * INSTANTLY (`behavior: 'auto'`) instead of smoothly. A smooth scroll
       * from 0 to the target page gets interrupted by the container's
       * `scroll-snap-type: x mandatory`, landing between pages — the user
       * sees "half of page 1 and half of page 2". Instant scroll snaps
       * cleanly to the target page on mount; subsequent active-clip changes
       * (a split/merge landing the clip on another page) use the smooth
       * animation, which is fine because the scroll is between adjacent
       * pages with snap points that the animation can settle on.
       */
      const page = pageForTime((clip.vStart + clip.vEnd) / 2);

      if (page !== currentPageRef.current) {
        const isFirstRun = activeClipFirstRunRef.current;
        activeClipFirstRunRef.current = false;

        currentPageRef.current = page;

        setViewPage(page);

        scrollToPage(page, isFirstRun ? 'auto' : 'smooth');
      } else {
        activeClipFirstRunRef.current = false;
      }
    }, [activeClip, displayClips, pageForTime, scrollToPage]);

    /*
     * Mount-time fallback: if there is no active clip but the playhead is
     * already past the start (e.g. the user was playing audio in the
     * single-row view and switched to stacked), scroll to the page
     * containing the current playback position so the user doesn't lose
     * their place. Instant scroll for the same snap-settling reason as
     * above. Runs once on mount only.
     */
    useEffect(() => {
      if (activeClip >= 0) return; // the effect above handles this case
      if (currentTime <= 0) return;

      const page = pageForTime(currentTime);
      if (page <= 0) return;

      currentPageRef.current = page;
      setViewPage(page);
      scrollToPage(page, 'auto');
    }, []);

    /*
     * =========================================================
     * SEEK
     * =========================================================
     */

    const handleRowSeek = useCallback(
      (time: number) => {
        onSeek(time);

        onActiveClipChange(-1);

        const page = pageForTime(time);

        if (page !== currentPageRef.current) {
          currentPageRef.current = page;

          setViewPage(page);
        }

        scrollToPage(page);
      },
      [onSeek, onActiveClipChange, pageForTime, scrollToPage],
    );

    /*
     * =========================================================
     * CLIP PLAYBACK
     * =========================================================
     */

    const stackedPlayClip = useCallback(
      (start: number, end: number, reps: number) => {
        setClipPlayActive(true);

        onPlayRange(start, end, reps, () => {
          setClipPlayActive(false);
        });
      },
      [onPlayRange],
    );

    /*
     A split/merge changes which clip should be playing. The parent describes
     that as data (`clipPlayRequest`); this view consumes it here rather than the
     parent reaching in through a handle.
     */
    useClipPlayRequest(clipPlayRequest, stackedPlayClip);

    /*
     * =========================================================
     * RENDER
     * =========================================================
     */

    return (
      <div
        className="stacked-waveform"
        ref={scrollerRef}
        role="slider"
        tabIndex={0}
        aria-label={t('waveform.ariaLabel')}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, waveform.duration)}
        aria-valuenow={currentTime}
        onKeyDown={onKeyDown}
        onPointerDown={e => {
          pinchBind.onPointerDown(e);
          pageDragPointerDown?.(e);
        }}
        {...pageDragRest}
      >
        {pagedRows.length > 0 && (
          <div className="stacked-waveform__pageno">
            {Math.min(viewPage + 1, pagedRows.length)} / {pagedRows.length}
          </div>
        )}

        <div className="stacked-waveform__pages">
          {pagedRows.map((page, pageIndex) => (
            <div key={pageIndex} className="stacked-waveform__page">
              {page.map(({row, gi}) => (
                <StackRow
                  key={gi}
                  row={row}
                  gi={gi}
                  waveform={waveform}
                  windowSecs={windowSecs}
                  currentTime={currentTime}
                  playing={playing}
                  clipPlayActive={clipPlayActive}
                  activeClip={activeClip}
                  repetitions={repetitions}
                  onStopPlayback={onStopPlayback}
                  onActivate={onActiveClipChange}
                  onSwipeClip={onSwipeClip}
                  minSplitPieceSec={minSplitPieceSec}
                  onPlayRange={stackedPlayClip}
                  onSeek={handleRowSeek}
                  getCurrentTime={getCurrentTime}
                  suppressClickRef={suppressRowClickRef}
                />
              ))}

              {Array.from({
                length: Math.max(0, rowsPerPage - page.length),
              }).map((_, virtualIndex) => (
                <div
                  key={`virtual-${virtualIndex}`}
                  className="stacked-waveform__row stacked-waveform__row--virtual"
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  },
);
