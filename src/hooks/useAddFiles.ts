/**
 * Adds files to the player from the file picker.
 *
 * Owns the "add files" reaction: passing the selection to the player's track
 * loader and reporting how many unsupported files were skipped.
 */

import {useCallback} from 'react';

interface AddTracksResult {
  added: number;
  skipped: number;
}

export function useAddFiles(
  addTracks: (files: FileList, playAfter?: boolean) => Promise<AddTracksResult>,
  onSkipped?: (skipped: number) => void,
) {
  const handleFiles = useCallback(
    async (files: FileList, playAfter: boolean = true) => {
      const {skipped} = await addTracks(files, playAfter);
      if (skipped > 0) onSkipped?.(skipped);
    },
    [addTracks, onSkipped],
  );

  return {handleFiles};
}
