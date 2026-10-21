/**
 * Stacked-view page geometry.
 *
 * A page holds a run of rows, so its time span runs from the first row's start
 * to the last row's end. Page *indices* are positional: a split or merge
 * re-packs the rows, which can hand a clip to a different page while the same
 * audio is still what the user is looking at.
 *
 * `isClipOnPage` answers "was this clip on the page on screen?" so the view
 * only pages to the active clip when it really has to move.
 */

export interface PageSpan {
  start: number;
  end: number;
}

/** Does the clip's `[start, end]` span share any time with the page? */
export function isClipOnPage(
  span: PageSpan | undefined,
  clipStart: number,
  clipEnd: number,
): boolean {
  if (!span) {
    return false;
  }

  return clipEnd >= span.start && clipStart <= span.end;
}
