import {createContext, useRef, useState, type ReactNode} from 'react';

export const ClipAnnotations = createContext<{
  marks: ReadonlySet<string>;
  toggle: (clipKey: string) => void;
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
      return new Set<string>(
        Array.isArray(saved)
          ? saved.filter(value => typeof value === 'string')
          : [],
      );
    } catch {
      return new Set<string>();
    }
  });

  const latestMarks = useRef(marks);

  function toggle(clipKey: string) {
    const next = new Set(latestMarks.current);
    if (next.has(clipKey)) next.delete(clipKey);
    else next.add(clipKey);
    latestMarks.current = next;
    setMarks(next);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // Keep annotations available for this session if storage is blocked.
      }
    }
  }

  return (
    <ClipAnnotations.Provider value={storageKey ? {marks, toggle} : null}>
      {children}
    </ClipAnnotations.Provider>
  );
}
