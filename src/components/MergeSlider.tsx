/**
 * Merge threshold slider for the clip toolbar.
 *
 * Lets the user adjust how long a silent gap between detected clips must be
 * before the clips are combined into one. The control is a range input flanked
 * by -/+ steppers, with the resulting clip count on its rounded rectangular thumb.
 *
 * Value handling:
 * - `value` is the snapped merge gap (seconds), owned by the parent who uses it
 *   for the actual merging. The component is controlled through this prop and
 *   reports changes via `onChange(gap)`.
 * - The raw continuous thumb position is kept as *internal* state, so dragging
 *   is smooth: the thumb follows the pointer while the effective merge gap snaps
 *   to the nearest detected gap boundary (read from the store).
 */
import {useEffect, useRef, useState} from 'react';
import {useAppSelector} from '../store/hooks';
import {selectGaps} from '../store/selectors';
import {useT} from '../i18n';
import './MergeSlider.css';

interface MergeSliderProps {
  /** Snapped merge gap (seconds) used for merging clips. */
  value: number;
  /** Number of clips after merging, shown on the thumb. */
  clipCount: number;
  /** Reports the snapped merge gap whenever it changes. */
  onChange: (gap: number) => void;
  /** Disables the slider and steppers (e.g. while playing). */
  disabled?: boolean;
}

function bubbleLeftPosition(
  raw: number,
  gapValues: number[],
  width: number,
  thumbW: number,
) {
  const gapMin = gapValues.length > 0 ? gapValues[0]! : 0;
  const gapMax = gapValues.length > 0 ? gapValues[gapValues.length - 1]! : 0;
  const pct =
    gapMax > gapMin
      ? Math.min(1, Math.max(0, (raw - gapMin) / (gapMax - gapMin)))
      : 0;
  return width - (thumbW / 2 + (width - thumbW) * pct);
}

export function MergeSlider({
  value,
  clipCount,
  onChange,
  disabled = false,
}: MergeSliderProps) {
  // Detected silent-gap lengths the slider snaps to, ascending.
  const gapValues = useAppSelector(selectGaps);
  const t = useT();
  // Raw thumb position (seconds). Internal so the thumb tracks the pointer
  // continuously while dragging; only the reported `value` snaps.
  const [sliderValue, setSliderValue] = useState(value);
  useEffect(() => {
    setSliderValue(value);
  }, [value]);
  // Slider metrics: track the slider element's width and thumb size so the
  // bubble label stays anchored to the thumb as the layout resizes.
  const sliderWrapRef = useRef<HTMLDivElement>(null);
  const [sliderMetrics, setSliderMetrics] = useState({
    width: 200,
    thumbW: 36,
  });

  const bubbleLeft = bubbleLeftPosition(
    sliderValue,
    gapValues,
    sliderMetrics.width,
    sliderMetrics.thumbW,
  );

  useEffect(() => {
    const el = sliderWrapRef.current;
    if (!el) return;
    const update = () => {
      const tw =
        parseFloat(getComputedStyle(el).getPropertyValue('--thumb-w')) || 36;
      setSliderMetrics({width: el.clientWidth, thumbW: tw});
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Steppers move the gap to the adjacent detected boundary; the slider drag
  // follows the pointer continuously and snaps only the effective merge gap.
  const stepToPrev = () => {
    const next = gapValues.filter(gap => gap < value).at(-1) ?? gapValues[0];
    if (next !== undefined) {
      setSliderValue(next);
      onChange(next);
    }
  };
  const stepToNext = () => {
    const next = gapValues.find(gap => gap > value) ?? gapValues.at(-1);
    if (next !== undefined) {
      setSliderValue(next);
      onChange(next);
    }
  };
  const [preview, setPreview] = useState(false);
  const startedOnThumb = useRef(false);
  const gesture = useRef<{
    x: number;
    y: number;
    axis: 'pending' | 'horizontal' | 'vertical';
  } | null>(null);
  const suppressClick = useRef(false);
  const applyRaw = (raw: number) => {
    setSliderValue(raw);
    let best = 0;
    let distance = Infinity;
    for (const gap of gapValues) {
      if (Math.abs(gap - raw) < distance) {
        best = gap;
        distance = Math.abs(gap - raw);
      }
    }
    onChange(best);
  };
  const applyPointer = (element: HTMLInputElement, x: number) => {
    const rect = element.getBoundingClientRect();
    const travel = Math.max(1, rect.width - sliderMetrics.thumbW);
    const fraction = Math.min(
      1,
      Math.max(0, (x - rect.left - sliderMetrics.thumbW / 2) / travel),
    );
    const min = gapValues[0] ?? 0;
    const max = gapValues.at(-1) ?? 0;
    applyRaw(max - fraction * (max - min));
  };
  const classify = (x: number, y: number) => {
    const start = gesture.current;
    if (!start || start.axis !== 'pending') return;
    const dx = Math.abs(x - start.x),
      dy = Math.abs(y - start.y);
    if (Math.max(dx, dy) >= 8) start.axis = dy > dx ? 'vertical' : 'horizontal';
  };

  return (
    <div
      className="clip-merge"
      onPointerDownCapture={event => {
        suppressClick.current = false;
        gesture.current = {x: event.clientX, y: event.clientY, axis: 'pending'};
        if (event.target instanceof HTMLButtonElement)
          event.target.setPointerCapture(event.pointerId);
      }}
      onPointerMoveCapture={event => classify(event.clientX, event.clientY)}
      onPointerUpCapture={event => {
        classify(event.clientX, event.clientY);
        suppressClick.current = gesture.current?.axis === 'vertical';
      }}
      onClickCapture={event => {
        if (!suppressClick.current || event.detail === 0) return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="clip-merge__stepper">
        <button
          type="button"
          aria-label={t('merge.increaseGap')}
          disabled={
            disabled || value >= (gapValues[gapValues.length - 1] ?? Infinity)
          }
          onClick={stepToNext}
        >
          -
        </button>
        <div className="clip-merge__slider" ref={sliderWrapRef}>
          {preview && (
            <span
              className="clip-merge__preview"
              style={{left: `${bubbleLeft}px`}}
              aria-hidden="true"
            >
              {clipCount}
            </span>
          )}
          <span
            className="clip-merge__bubble"
            style={{left: `${bubbleLeft}px`}}
          >
            {clipCount}
          </span>
          <input
            type="range"
            aria-label={t('merge.decreaseGap')}
            aria-valuetext={t(
              clipCount === 1 ? 'merge.clipCount' : 'merge.clipCountPlural',
              {count: clipCount},
            )}
            min={gapValues[0] ?? 0}
            max={gapValues[gapValues.length - 1] ?? 0}
            step={0.005}
            value={sliderValue}
            disabled={disabled}
            onChange={event => applyRaw(Number(event.target.value))}
            onPointerDown={event => {
              if (disabled || !event.isPrimary || event.button !== 0) return;
              const box = event.currentTarget.getBoundingClientRect();
              startedOnThumb.current =
                Math.abs(event.clientX - box.left - bubbleLeft) <=
                sliderMetrics.thumbW / 2;
              event.preventDefault();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={event => {
              if (
                disabled ||
                gesture.current?.axis !== 'horizontal' ||
                !event.currentTarget.hasPointerCapture(event.pointerId)
              )
                return;
              setPreview(startedOnThumb.current);
              applyPointer(event.currentTarget, event.clientX);
            }}
            onPointerUp={event => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId))
                return;
              if (!disabled && gesture.current?.axis !== 'vertical')
                applyPointer(event.currentTarget, event.clientX);
              setPreview(false);
              event.currentTarget.releasePointerCapture(event.pointerId);
              gesture.current = null;
            }}
            onLostPointerCapture={() => setPreview(false)}
            onPointerCancel={() => {
              setPreview(false);
              suppressClick.current = true;
              gesture.current = null;
            }}
          />
        </div>
        <button
          type="button"
          aria-label={t('merge.decreaseGap')}
          disabled={disabled || value <= (gapValues[0] ?? -Infinity)}
          onClick={stepToPrev}
        >
          +
        </button>
      </div>
    </div>
  );
}
