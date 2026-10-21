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
import {useAppSelector} from '../store/hooks';
import {selectMergeScope} from '../store/selectors';
import './StackedWaveform.css';
import {getWindowSecs} from '../utils/rowWaveform';
import {type PageSpan, isClipOnPage} from '../utils/stackedPages';

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
    const mergeScope = useAppSelector(selectMergeScope);
    /*
     * Last window length rendered. Fed back into getWindowSecs so small changes
     * (a new selection, a clip growing slightly) do not re-paginate the rows.
     */
    const prevWindowSecsRef = useRef(0);
    /*
     * =========================================================
     * ROWS
     * =========================================================
     */

    const windowSecs = useMemo(
      () =>
        getWindowSecs(scrollerWidth, displayClips, waveform.duration, {
          activeClip,
          mergeScope,
          previousWindowSecs: prevWindowSecsRef.current,
        }),
      [scrollerWidth, displayClips, waveform.duration, activeClip, mergeScope],
    );

    useEffect(() => {
      prevWindowSecsRef.current = windowSecs;
    }, [windowSecs]);

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
        rows[0].start = 0;

        /*
         * Last row reaches the physical end of
         * the audio.
         */
        rows[rows.length - 1].end = Math.max(
          rows[rows.length - 1].end,
          waveform.duration,
        );
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

    /*
     * Page spans from the layout before this render. A split or merge re-packs
     * the rows, which can hand the clip the user just edited to another page
     * while it is still the clip they were looking at. The active-clip follow
     * compares against this to tell that case apart from a clip that was never
     * on the page (prev/next clip, a request from elsewhere).
     */
    const prevPageTimesRef = useRef<PageSpan[]>([]);

    useEffect(() => {
      prevPageTimesRef.current = pageTimesRef.current;

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

      if (time < pages[0].start) {
        return 0;
      }

      if (time >= pages[last].end) {
        return last;
      }

      for (let i = 0; i < pages.length; i++) {
        if (time < pages[i].end) {
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
       * A split or merge re-packs the rows, so the clip can change page while
       * staying the one the user was editing. Keep the current page when the
       * clip was on it before the change; only page for a clip that was not on
       * screen.
       */
      if (
        isClipOnPage(
          prevPageTimesRef.current[Math.max(0, currentPageRef.current)],
          clip.vStart,
          clip.vEnd,
        )
      ) {
        return;
      }

      const page = pageForTime((clip.vStart + clip.vEnd) / 2);

      if (page !== currentPageRef.current) {
        currentPageRef.current = page;

        setViewPage(page);

        scrollToPage(page);
      }
    }, [activeClip, displayClips, pageForTime, scrollToPage]);

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
