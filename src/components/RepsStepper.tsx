/**
 * Repeat count stepper for the clip toolbar.
 *
 * Lets the user choose how many times a clip is played when clicked. The count
 * is adjusted by dragging a repeat badge horizontally, clamped between 1 and 20.
 *
 * Value handling:
 * - Fully controlled: the parent owns the count and receives changes via
 *   `onChange(value)`.
 */

import {useRef, useState} from 'react';
import {useT} from '../i18n';
import './RepsStepper.css';

interface RepsStepperProps {
  /** Number of times a clicked clip is repeated. */
  value: number;
  /** Reports the new count whenever the user steps it. */
  onChange: (value: number) => void;
  /** Lower bound for the count. */
  min?: number;
  /** Upper bound for the count. */
  max?: number;
  /** Disables the stepper (e.g. while playing). */
  disabled?: boolean;
  /**
   * Shows the "Repeats" label. Hidden while the merge-gap control shares the
   * row, so both controls fit on one line.
   */
  showLabel?: boolean;
}

export function RepsStepper({
  value,
  onChange,
  min = 1,
  max = 20,
  disabled = false,
  showLabel = true,
}: RepsStepperProps) {
  const t = useT();
  const drag = useRef<{id: number; x: number; value: number} | null>(null);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0);
  const finishDrag = () => {
    drag.current = null;
    setDragging(false);
    setOffset(0);
  };
  const setValue = (next: number) => {
    onChange(Math.min(max, Math.max(min, next)));
  };

  return (
    <div className="clip-reps">
      {showLabel && <span className="clip-reps__label">{t('reps.label')}</span>}
      <div
        className={`clip-reps__dial ${dragging ? 'clip-reps__dial--dragging' : ''}`}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={t('reps.label')}
        aria-orientation="horizontal"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-disabled={disabled}
        title={t('reps.dragHint')}
        onPointerDown={event => {
          if (disabled || !event.isPrimary || event.button !== 0) return;
          event.stopPropagation();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {id: event.pointerId, x: event.clientX, value};
          setDragging(true);
        }}
        onPointerMove={event => {
          const start = drag.current;
          if (disabled || !start || event.pointerId !== start.id) return;
          event.stopPropagation();
          const raw = Math.min(
            max,
            Math.max(min, start.value + (event.clientX - start.x) / 16),
          );
          const snapped = Math.round(raw);
          setOffset((snapped - raw) * 18);
          setValue(snapped);
        }}
        onPointerUp={event => {
          if (!drag.current) return;
          event.stopPropagation();
          finishDrag();
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={finishDrag}
        onLostPointerCapture={finishDrag}
        onKeyDown={event => {
          if (disabled) return;
          const next = {
            ArrowRight: value + 1,
            ArrowUp: value + 1,
            ArrowLeft: value - 1,
            ArrowDown: value - 1,
            Home: min,
            End: max,
          }[event.key];
          if (next === undefined) return;
          event.preventDefault();
          event.stopPropagation();
          setValue(next);
        }}
      >
        <svg
          className="clip-reps__icon"
          viewBox="0 0 68 44"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 20v-6a6 6 0 0 1 6-6h37m-5-4 5 4-5 4M56 24v6a6 6 0 0 1-6 6H13m5-4-5 4 5 4" />
        </svg>
        {dragging && (
          <span className="clip-reps__rest" aria-hidden="true">
            {value}
          </span>
        )}
        <span className="clip-reps__window" aria-hidden="true">
          {Array.from({length: max - min + 1}, (_, index) => {
            const item = min + index;
            return (
              <span
                key={item}
                className={`clip-reps__value ${item === value ? 'clip-reps__value--current' : ''}`}
                style={{
                  transform: `translateX(${(item - value) * 18 + offset}px)`,
                  opacity:
                    item === value
                      ? 1
                      : dragging && Math.abs(item - value) === 1
                        ? 0.4
                        : 0,
                }}
              >
                {item}
              </span>
            );
          })}
        </span>
      </div>
    </div>
  );
}
