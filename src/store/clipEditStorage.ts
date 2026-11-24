import type {Clip} from '../utils/clips';

export interface ClipEdit {
  // Global edits store the source clips; clip-scope edits store the edited grouping.
  clips: Clip[];
  mergeGap?: number;
  gaps?: number[];
}

const key = (trackId: string, scope: string) =>
  `listenoop-clip-edit-v1:${scope}:${trackId}`;

export function loadClipEdit(
  trackId: string,
  scope: string,
): ClipEdit | undefined {
  try {
    const edit: ClipEdit | null = JSON.parse(
      localStorage.getItem(key(trackId, scope)) ?? 'null',
    );
    if (
      edit &&
      Array.isArray(edit.clips) &&
      (scope === 'clip' ||
        (Number.isFinite(edit.mergeGap) && Array.isArray(edit.gaps)))
    ) {
      return edit;
    }
  } catch {
    // Fall back to automatic detection when storage cannot be read.
  }
}

export function saveClipEdit(trackId: string, scope: string, edit: ClipEdit) {
  try {
    localStorage.setItem(key(trackId, scope), JSON.stringify(edit));
  } catch {
    // The current session can still use the edit if browser storage is full.
  }
}
