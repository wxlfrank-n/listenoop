import {useRef, useState} from 'react';
import {useAppDispatch, useAppSelector} from '../store/hooks';
import {updateConfig} from '../store/configSlice';
import {useT} from '../i18n';

export function SpeedControl({disabled = false}: {disabled?: boolean}) {
  const value = useAppSelector(s => s.config.playbackSpeed);
  const dispatch = useAppDispatch();
  const t = useT();
  const drag = useRef<{id: number; y: number; value: number} | null>(null);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0);
  const index = Math.round((value - 0.5) * 20);
  const finishDrag = () => {
    drag.current = null;
    setDragging(false);
    setOffset(0);
  };
  const change = (next: number) => {
    if (disabled) return;
    const speed = Math.min(1.5, Math.max(0.5, Math.round(next * 20) / 20));
    if (speed === value) return;
    dispatch(updateConfig({playbackSpeed: speed}));
  };
  return (
    <div
      className={`playback-speed ${dragging ? 'playback-speed--dragging' : ''}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={t('settings.playbackSpeed')}
      aria-valuemin={0.5}
      aria-valuemax={1.5}
      aria-valuenow={value}
      aria-valuetext={`${value}×`}
      aria-orientation="vertical"
      onPointerDown={event => {
        if (disabled || !event.isPrimary || event.button !== 0) return;
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {id: event.pointerId, y: event.clientY, value};
        setDragging(true);
      }}
      onPointerMove={event => {
        const start = drag.current;
        if (disabled || !start || start.id !== event.pointerId) return;
        const raw = Math.min(
          20,
          Math.max(
            0,
            (start.value - 0.5) * 20 + (start.y - event.clientY) / 16,
          ),
        );
        const snapped = Math.round(raw);
        setOffset((snapped - raw) * 20);
        change(0.5 + snapped * 0.05);
      }}
      onPointerUp={event => {
        if (!drag.current) return;
        finishDrag();
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={finishDrag}
      onLostPointerCapture={finishDrag}
      onKeyDown={event => {
        if (disabled) return;
        const next = {
          ArrowUp: value + 0.05,
          ArrowDown: value - 0.05,
          Home: 0.5,
          End: 1.5,
        }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        change(next);
      }}
    >
      {dragging && (
        <span className="playback-speed__rest" aria-hidden="true">
          {value.toFixed(2)}×
        </span>
      )}
      <span className="playback-speed__window" aria-hidden="true">
        {Array.from({length: 21}, (_, item) => (
          <span
            key={item}
            className={`playback-speed__number ${item === index ? 'playback-speed__number--current' : ''}`}
            style={{
              transform: `translateY(${(item - index) * 20 + offset}px)`,
              opacity:
                item === index
                  ? 1
                  : dragging && Math.abs(item - index) === 1
                    ? 0.4
                    : 0,
            }}
          >
            {(0.5 + item * 0.05).toFixed(2)}×
          </span>
        ))}
      </span>
    </div>
  );
}
