/**
 * Repeat count stepper for the clip toolbar.
 *
 * Lets the user choose how many times a clip is played when clicked. The count
 * is rendered as a -/+ stepper clamped between 1 and 20.
 *
 * Value handling:
 * - Fully controlled: the parent owns the count and receives changes via
 *   `onChange(value)`.
 */

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
  const step = (delta: number) =>
    onChange(Math.min(max, Math.max(min, value + delta)));

  return (
    <div className="clip-reps">
      {showLabel && <span className="clip-reps__label">{t('reps.label')}</span>}
      <div className="clip-reps__stepper">
        <button
          type="button"
          aria-label={t('reps.decrease')}
          disabled={disabled || value <= min}
          onClick={() => step(-1)}
        >
          −
        </button>
        <span className="clip-reps__value">{value}</span>
        <button
          type="button"
          aria-label={t('reps.increase')}
          disabled={disabled || value >= max}
          onClick={() => step(1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
