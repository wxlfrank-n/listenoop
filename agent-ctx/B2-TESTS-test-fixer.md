# Task B2-TESTS — Fix TypeScript strict-mode errors in test files

## Summary
Fixed all TypeScript strict-mode (`strict: true` + `noUncheckedIndexedAccess: true`) errors in the in-scope test files (and `e2e/helpers.ts`). No non-test source files were touched.

## Files modified (8 total)
- `e2e/helpers.ts` — 2 errors → `return {current: current!, total: total!}` (destructured array values from `text.split('/').map(...)` were `number | undefined`).
- `src/utils/clips.test.ts` — 32 errors → added `!` after array-indexed access (`clips[0]!.foo`, `result?.pieces[0]!.children`, etc.) and to `result.clips!` / `[parent]!` destructurings.
- `src/utils/swipe.test.ts` — 30 errors → added `!` after `result.clips[N]`, `[idx]`, and `result?.clips[0]!`. Also fixed `bounds(result.clips)` → `bounds(result.clips!)` in 3 spots where `ClipSplitResult.clips?` (optional) made the array nullable.
- `src/components/RowWaveform.pinch.test.tsx` — 19 errors → added `!` to all `clipsEls[0]`, `clipsEls[1]`, `clipsEls[2]` occurrences (both in `const a = clipsEls[0]!` assignments and inline `fireEvent.pointerDown(clipsEls[0]!, ...)` calls).
- `src/components/RowWaveform.test.tsx` — 7 errors → added `!` to all `clips[0]` occurrences (`clip: clips[0]!`, `clips[0]!.vStart`, `clips[0]!.vEnd`).
- `src/components/Clip.test.tsx` — 5 errors → added `!` to `rects[0]` and `rects[1]` (NodeListOf indexing yields `Element | undefined`).
- `src/utils/listener.test.ts` — 1 error → in `captureEvent` helper (used by 3 tests), replaced `return events[0];` with a runtime guard `const ev = events[0]; if (!ev) throw new Error('expected event to be captured'); return ev;` (helper used by multiple tests so a single guard beats sprinkling `!`).
- `src/components/Clips.test.tsx` — 1 error → `container.querySelectorAll('.waveform-clip')[1]!`.

## Verification
- `npx tsc -b 2>&1 | grep "error TS" | grep -E "(clips\.test|swipe\.test|RowWaveform|Clip\.test|Clips\.test|listener\.test|e2e/helpers)"` → 0 errors in any in-scope file.
- `npx tsc -b 2>&1 | tee /tmp/tsc_after_tests.txt` → 112 remaining errors, all in NON-test source files (`src/utils/clips.ts`, `src/components/Waveform.tsx`, `src/hooks/useClipPinchMerge.ts`, etc.) — out of scope for this task.
- `npx vitest run 2>&1 | tail -20` → **Test Files 24 passed (24)** / **Tests 271 passed (271)** ✅
- `npx prettier --write <all 8 files>` → all 8 files unchanged (already in canonical prettier format) ✅
- `npm run lint` → exit code 0 (clean) ✅

## Total errors fixed
**97** TypeScript errors across the 8 in-scope files:
- e2e/helpers.ts: 2
- clips.test.ts: 32 (reported as ~32, all resolved)
- swipe.test.ts: 30 (reported as ~30, all resolved)
- RowWaveform.pinch.test.tsx: 19
- RowWaveform.test.tsx: 7
- Clip.test.tsx: 5
- listener.test.ts: 1
- Clips.test.tsx: 1

## Errors NOT fixed
None — every reported error in the in-scope files was fixed. The 112 remaining `tsc` errors live in non-test source files (`clips.ts`, `Waveform.tsx`, `useClipPinchMerge.ts`, `DancingLines.tsx`, `MergeSlider.tsx`, `swipe.ts`, `StackedWaveform.tsx`, `wav.ts`, `useWaveform.ts`, `rowWaveform.ts`) and were intentionally left untouched per the task rules ("Do NOT touch any non-test file").

## Approach notes
- For one-off assertions on a single element access, used `!` postfix (e.g. `clips[0]!.start`).
- For repeated access to the same array element across a test (e.g. `clipsEls[0]` used in multiple `fireEvent` calls), preferred assigning once with `!` (`const a = clipsEls[0]!;`) so subsequent uses are already non-null.
- For the `captureEvent` helper called from multiple tests, used a runtime guard `if (!ev) throw new Error(...)` for a clearer failure message.
- For `bounds(result.clips)` calls where `result.clips` is `Clip[] | undefined` (from optional `clips?` field on `ClipSplitResult` / `ClipRangeMergeResult`), added `!` to `result.clips` to make it `Clip[]`, then `!` after any index access for the inner `Clip | undefined`.
- Test logic, assertions, and test names were not changed — only type narrowing / non-null assertions / runtime guards were added.
