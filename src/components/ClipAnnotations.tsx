import {createContext, useRef, useState, type ReactNode} from 'react';

type TimeRange = {start: number; end: number};

function parseRange(value: unknown): TimeRange[] {
  if (typeof value !== 'string') return [];
  const parts = value.split(':');
  if (parts.length !== 2 || parts.some(part => !part.trim())) return [];
  const start = Number(parts[0]);
  const end = Number(parts[1]);
  return Number.isFinite(start) && Number.isFinite(end) && start < end
    ? [{start, end}]
    : [];
}

function overlaps(first: TimeRange, second: TimeRange) {
  return first.start < second.end && second.start < first.end;
}

export const ClipAnnotations = createContext<{
  isAnnotated: (range: TimeRange) => boolean;
  toggle: (range: TimeRange) => void;
} | null>(null);

export function ClipAnnotationProvider({
  trackId,
  children,
}: {
  trackId: string | undefined;
  children: ReactNode;
}) {
  const storageKey = trackId && 'listenoop:clip-annotations:' + trackId;
  const [marks, setMarks] = useState(() => {
    try {
      const saved: unknown = storageKey
        ? JSON.parse(localStorage.getItem(storageKey) ?? '[]')
        : [];
      return Array.isArray(saved) ? saved.flatMap(parseRange) : [];
    } catch {
      return [];
    }
  });

  const latestMarks = useRef(marks);

  function toggle(range: TimeRange) {
    const current = latestMarks.current;
    const next = current.some(mark => overlaps(mark, range))
      ? current.flatMap(mark => {
          if (!overlaps(mark, range)) return [mark];
          const remaining: TimeRange[] = [];
          if (mark.start < range.start)
            remaining.push({start: mark.start, end: range.start});
          if (mark.end > range.end)
            remaining.push({start: range.end, end: mark.end});
          return remaining;
        })
      : [...current, {start: range.start, end: range.end}];
    latestMarks.current = next;
    setMarks(next);
    if (storageKey) {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify(next.map(({start, end}) => start + ':' + end)),
        );
      } catch {
        // Keep annotations available for this session if storage is blocked.
      }
    }
  }

  return (
    <ClipAnnotations.Provider
      value={
        storageKey
          ? {
              isAnnotated: range => marks.some(mark => overlaps(mark, range)),
              toggle,
            }
          : null
      }
    >
      {children}
    </ClipAnnotations.Provider>
  );
}
