/**
 * Merge threshold slider for the clip toolbar.
 *
 * Lets the user adjust how long a silent gap between detected clips must be
 * before the clips are combined into one. The control is a range input flanked
 * by -/+ steppers, with a floating bubble showing the resulting clip count.
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
  /** Number of clips after merging, shown in the bubble. */
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
    thumbW: 10,
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
        parseFloat(getComputedStyle(el).getPropertyValue('--thumb-w')) || 10;
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
  const onSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = parseFloat(e.target.value);
    // Keep the thumb continuous but clamp the effective gap to the nearest
    // detected boundary so merging always uses a "real" silent-gap length.
    setSliderValue(raw);
    let best = 0;
    let bestDist = Infinity;
    for (const g of gapValues) {
      const d = Math.abs(g - raw);
      if (d < bestDist) {
        bestDist = d;
        best = g;
      }
    }
    onChange(best);
  };

  return (
    <div className="clip-merge">
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
          <span
            className="clip-merge__bubble"
            style={{left: `${bubbleLeft}px`}}
          >
            {t(clipCount === 1 ? 'merge.clipCount' : 'merge.clipCountPlural', {
              count: clipCount,
            })}
          </span>
          <input
            type="range"
            min={gapValues[0] ?? 0}
            max={gapValues[gapValues.length - 1] ?? 0}
            step={0.005}
            value={sliderValue}
            disabled={disabled}
            onChange={onSliderChange}
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
