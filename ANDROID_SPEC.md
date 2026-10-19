# Listenoop — Android Implementation Specification

> **Purpose.** This document specifies a native Android port of **Listenoop**
> (browser-based music player that auto-splits tracks into loopable clips),
> faithful to the two existing implementations:
>
> - **Web reference** — `C:\Users\Admin\Documents\dev\listenoop-web`
>   (React 19 + TypeScript + Redux Toolkit; the behavior authority).
> - **iOS reference** — `C:\Users\Admin\Documents\dev\listenoop-ios`
>   (Swift/SwiftUI + `AVAudioPlayer`; the native-app authority — layout,
>   gestures, background audio, lock-screen integration).
>
> Where the two references disagree, §22 records the resolution adopted for
> Android. Do **not** copy the outdated `SPEC.md` / `MyPlayer_Features.md` in
> this repo (they describe zoom, region selection, and old detection settings
> that do not exist in the code).

---

## 0. Recommended tech stack

| Concern | Recommendation | Rationale |
|---|---|---|
| Language / UI | Kotlin + Jetpack Compose (Material3) | Declarative UI maps 1:1 to SwiftUI port; Canvas for waveform |
| Audio playback | **Media3 ExoPlayer** (`androidx.media3`) | Gapless-capable, precise seek, background service |
| Background + lock screen | Media3 `MediaSessionService` + notification | = iOS `MediaSession.swift` |
| Waveform decode | Media3 `Transformer`/`MediaExtractor` + PCM dump, or `Sonic`/`FFmpegKit` if patents allow; else `MediaCodec` raw PCM | Must produce mono `FloatArray` + sample rate (§6) |
| State | Single `ViewModel` + `StateFlow` (or Redux-style store) | Mirrors `AppState` / Redux slices (§4) |
| Persistence | Jetpack `DataStore` (proto or prefs) | Mirrors `localStorage` / `UserDefaults` (§5) |
| Imported files | App-specific storage + MediaStore (optional) | Mirrors iOS `Documents/` copy (§14) |
| DI / tests | Hilt (optional) + JUnit4/5 + Compose UI tests | Mirror web Vitest matrix (§21) |

Minimum SDK 26 (ExoPlayer + `Canvas` + DataStore all fine there).

---

## 1. Product overview

Listenoop plays audio files and **automatically splits each track into clips**
at silences so users can practice/loop short passages.

**Core user flows**

1. Launch → bundled sample track (`01A.mp3`) loaded, waveform decoded, clips
   detected, single-row waveform at `0:00`, paused.
2. Tap a clip → it loops `repetitions` times (default 3), viewport follows it.
3. Tap empty waveform → seek; play/pause/prev/next/skip±N as usual.
4. Swipe clip up → split; swipe down/diagonals → merge; pinch two clips →
   merge range; spread one clip → split.
5. Global scope → merge slider fuses everything below a gap threshold.
6. Playlist `+` → import files → optional autoplay → remove/reorder.
7. Settings → appearance / playback / detection (live, persisted).
8. Background the app → playback continues, lock-screen/notification controls.

**Non-goals:** waveform zoom, region selection, cloud sync, streaming, editing
audio files, desktop widgets.

---

## 2. Architecture (recommended module map)

```
app/
  MainActivity.kt + ListenoopApp.kt        // entry, ViewModel wiring (= ListenoopApp.swift / main.tsx)
  player/PlayerService.kt                  // Media3 MediaSessionService (foreground)
  audio/AudioEngine.kt                     // ExoPlayer wrapper + clip-loop state machine (§7)
  audio/WaveformDecoder.kt                 // URL → WaveformData {mono FloatArray, sampleRate, duration} (§6)
  audio/AudioMeta.kt                       // channels / sample rate / bitrate (§6.4)
  audio/DefaultTracks.kt                   // bundled 01A.mp3
  clips/ClipDetector.kt                    // EXACT port of §8 (no deviations)
  clips/MergeScopes.kt                     // global mergeGap vs clip scopedClips (§9)
  store/AppState.kt                        // single observable state (§4)
  store/AppConfig.kt + ConfigStore.kt      // settings + persistence (§5)
  waveform/WaveformWindow.kt               // getBaseWindowSecs/getWindowSecs (§10.1)
  waveform/RowViewport.kt                  // pure viewport math: follow/clip-follow/buffer (§10)
  waveform/BarsRenderer.kt                 // Canvas bars algorithm (§11)
  waveform/CursorPosition.kt               // edge-pinning math (§11.4)
  ui/ (Compose screens, one file per web component §13–§16)
  theme/Theme.kt (10 palettes, §17)  i18n/Strings.kt (en/zh/no, §18)
```

**Layering rule (from both references):** pure math (`ClipDetector`,
`WaveformWindow`, `RowViewport`, cursor) must be **framework-free and unit
tested**; views only translate state → pixels and forward gestures. The web
keeps per-frame work imperative (no re-render at 60 Hz); on Android do the
same — drive playhead/cursor/translation from a single progress callback and
prefer `Modifier.offset` / Canvas redraw over recomposition where cheap.
(Compose recomposition at 60 Hz of a small viewport subtree is acceptable if
bars Canvas reads state directly, mirroring iOS.)

---

## 3. Domain models (exact fields)

```kotlin
data class Track(id: String, title: String, artist: String,
                 duration: Double, url: Uri)          // duration 0 until loaded
data class WaveformData(val data: FloatArray, val sampleRate: Double,
                        val duration: Double)        // data = MONO, -1..1
enum class WaveformStatus { IDLE, LOADING, READY, ERROR }
enum class WaveformViewMode { ROW, STACKED }         // web 'horizontal'|'stacked'
enum class MergeScope { CLIP, GLOBAL }
enum class SwipeDirection { UP, DOWN, UP_RIGHT, UP_LEFT, DOWN_RIGHT, DOWN_LEFT }
data class Clip(val start: Double, val end: Double,   // logical bounds
                val vStart: Double, val vEnd: Double, // expanded (render/play) bounds
                val children: List<Clip> = emptyList(),
                val expanded: Boolean = false)
data class AudioMeta(val channels: Int, val sampleRate: Double, val bitrateKbps: Int)
data class Notice(val kind: INFO|ERROR, val message: String)
```

`WaveWindow { windowStartSec, windowLen }` for render functions.

---

## 4. App state (single source of truth)

Mirror of Redux `player+analysis+config` slices and iOS `AppState`:

```kotlin
// Player
tracks: List<Track>, currentTrackIndex: Int (-1 = none),
isPlaying: Boolean, currentTime: Double, duration: Double
// Analysis
waveform: WaveformData?, waveformStatus: WaveformStatus,
clips: List<Clip>, gaps: List<Double>, minGap: Double
// Editing
mergeGap: Double (global, session-local), scopedClips: List<Clip>? (clip scope),
activeClip: Int (-1), playingClip: Boolean,
clipPlayRange: Pair<Double,Double>?, clipRound: Int,
clipRoundPreserveManual: Boolean
// UI
notice: Notice?, showPlaylist/showSettings/showFileImporter: Boolean,
pinchActive: Boolean
```

Derived: `displayClips` = CLIP → `scopedClips ?: mergeByGap(clips, minGap)`;
GLOBAL → `mergeByGap(clips, mergeGap)`. `canSplit(c)` =
`splitClipAtLargestGap(c) != null`.

**Viewport states (row view, §10):** `windowStart`, `bufferStart/bufferLen`,
`followEpoch{anchor,threshold}?`, `clipFollow{start,end,autoFollow,epochAnchor}?`,
`viewportManual: Boolean`, `manualUntil: Instant?`, pan base/latch flags,
`suppressNextTap`, pinch candidate. These live in the row UI state holder, not
global state (same as web refs / iOS `@State`).

---

## 5. Configuration (all settings — port verbatim)

| Key | Type | Default | Range | Presets |
|---|---|---|---|---|
| `skipSeconds` | Double | **10** | 1–60 step 1 | 5, 10, 15, 30 |
| `waveformView` | ROW/STACKED | **ROW** | — | — |
| `blockMs` | Double | **12** | 2–64 step 1 | 6, 12, 24, 48 |
| `silenceRatio` | Double | **0.01** | 0.005–0.01 step 0.005 | 0.005, 0.01 |
| `minClipLength` | Double | **0.3** | 0.2–1 step 0.05 | 0.1, 0.2, 0.3, 0.5, 1.0 |
| `minSplitPieceSec` | Double | **0.1** | 0.01–0.5 step 0.05 | 0.05, 0.1, 0.2, 0.3 |
| `repetitions` | Int | **3** | 1–20 step 1 | 1–5 |
| `showAdvancedControls` | Boolean | **false** | — | — |
| `mergeScope` | CLIP/GLOBAL | **CLIP** | — | — |
| `theme` | 10 ids | **midnight** | — | — |
| `language` | en/zh/no | **no** | — | — |

- Persist on every change (DataStore); load merges over defaults field-by-field
  with sanitizing (clamp reps, validate theme/lang/scope) so old installs survive.
- Changing `mergeScope` resets `scopedClips=null, mergeGap=minGap, activeClip=-1`.
- Storage key: `listenoop_config` (note: iOS ships a `Listeenoop_config` typo —
  do NOT copy the typo).
- Changing any of `blockMs/silenceRatio/minClipLength/minSplitPieceSec`
  recomputes clips for the current waveform (keyed recompute, §8).

---

## 6. Audio decoding (waveform + meta)

Decode the file to **mono float PCM** (channel average), keep original audio
untouched for playback (no downmix on output — matches iOS; web re-encodes to
WAV only for browser-compat playback, which Android does not need).

- `WaveformData(data, sampleRate, duration = frames/sampleRate)`.
- Meta: `channels`, `sampleRate`, `bitrateKbps = round(bytes*8/duration/1000)`.
- Decode off the main thread; status IDLE→LOADING→READY/ERROR; token-guard
  against track switches mid-decode. Cache per-URL while the track is loaded.
- Meta line format: `{Mono|Stereo|…} · {kHz with 1 decimal} · {kbps}`.

---

## 7. Audio engine (ExoPlayer wrapper — exact semantics)

### 7.1 Transport

- `load(url)`: stop loop, reset clip state, `currentTime=0`, set duration when
  known. `play/pause/seek(t)` clamp `t` to `[0, duration]` and publish
  immediately.
- Progress: report `currentTime` at ~60 Hz but only on change ≥ **0.016s**
  (both references throttle this way).
- `togglePlay`: pausing also clears any clip loop; playing clears stale loop
  first (prevents "next tap won't replay" bug).
- Prev/next are **two-step with 0.05s edge tolerance** (NOT 3-second restart):
  - Prev: if `currentTime ≤ 0.05` → previous track (wrap); else pause + park at 0.
  - Next: if `currentTime ≥ duration − 0.05` → next track (wrap); else pause +
    park at `duration` (web sets a hold-at-end guard so `ended` doesn't fire).
- Track end (normal playback) → auto-advance `nextTrack()` (wrap).
- Removing the current track auto-starts the nearest survivor or clears.
- Skip buttons jump `±skipSeconds`, clamped; disabled at exact edges.

### 7.2 Clip loop state machine — `playRange(start, end, repetitions,
onComplete, onRepeat)`

Port the web `playRange` / iOS `ClipLoop` **exactly**:

```
playRange: stop previous loop; seek(start); play; publish playing;
           loop = {start, end, reps=max(1,repetitions), count=0,
                   seeking=true, seekTs=now, recoveryAttempts=0}
tick (playback progress callback):
  if seeking:
    nearStart = t in [start−0.05, start+0.15] → seeking=false
    else if now−seekTs > 3000ms:
      if recoveryAttempts < 1: recoveryAttempts++, pause, seek(start), play
      else: abortLoop()            // pause + onComplete
  else if t >= end:
    count++; if count >= reps: finishLoop()   // pause, snap t=end if drift>0.001, onComplete
             else: resetToStart()             // pause, seek(start), onRepeat(), resume after 50ms settle
  else if t < start−0.05: abortLoop()
```

- Loop-internal pauses/resumes must NEVER publish `isPlaying=false` except via
  `finishLoop/abortLoop`; suppress the player's own pause/end events while a
  loop is armed (web `suppressRangePause` + `clipLoopActive` flag).
- `stopRange()` on: new `playRange`, pause-from-loop, skip-to-edge, track
  change. Plain ±skip does NOT cancel a loop (it re-seats on next tick).
- Snatch guard: if `|playerTime − expected| > 0.08` after play resumes, re-seek
  (web `snatchToStart`).

### 7.3 Background / audio focus

- Playback runs in a foreground `MediaSessionService`; `AUDIOFOCUS_GAIN`,
  ducking/pause on loss, headphone-unplug pause. (Parity with iOS
  `AVAudioSession(.playback)`.)

---

## 8. Clip detection (EXACT port — no deviations)

`makeInitClipData(data, sampleRate, {blockMs, silenceRatio, minClipLength,
minSplitPieceSec})`:

1. `blockSamples = max(64, round(blockMs/1000*sampleRate))`
   (12 ms @48 kHz = 576). `peakStride = max(1, round(blockSamples/8))`.
2. `silenceRatio = clamp(input, 0.0001, 0.01)` — the 0.01 ceiling is also the
   settings slider maximum, so the full slider range is live.
3. Per-block peak over every `peakStride`-th sample; `trackPeak` = max;
   `threshold = silenceRatio * trackPeak`; `isSound = peak > threshold`.
4. Contiguous sound runs → `Clip(start, end, vStart=start, vEnd=end)`.
5. `mergeClipsByConfig`: while >1 clip, skip clips with `len ≥ minClipLength`;
   else compare `leftGap/rightGap`, prefer smaller side; merge if
   `clipLen ≤ minSplitPieceSec || neighborLen < minClipLength`; restart scan
   after each merge.
6. `expandClips(expandRatio=0.25)`: each side eats 25% of adjacent silence —
   `vStart=max(0,start−0.25*(start−prevEnd))`,
   `vEnd=min(dur,end+0.25*(nextStart−end))`, `expanded=true`.
7. `getClipGaps`: gaps `> 0.01`s, finite, deduped, ascending.
8. `findMinMergeGap`: all `len ≥ minClipLength` → `minGap=0`; else binary-search
   `gaps` for the smallest gap making `mergeClipsByGap` fully valid; fallback
   `minGap=0` (leave unmerged).

`MIN_SPLIT_PIECE_SEC = 0.1`. Merge-epsilon for global regroup:
`mergeGap = split.gap − 0.000001`.

---

## 9. Merge / split semantics (both scopes)

- **Global scope:** single `mergeGap`; `displayClips = mergeByGap(clips,
  mergeGap)`; groups with `gap ≤ mergeGap`; parent keeps
  `start/end` (logical) + `vStart/vEnd` (expanded) + `children`.
- **Clip scope:** baseline `mergeByGap(clips, minGap)`; `scopedClips` holds the
  edited grouping; `mergeGap` slider hidden in this scope.
- **Split (up-swipe / spread / up-diagonals):** only if `canSplit` — needs
  ≥2 children and a boundary where both resulting pieces satisfy
  `minSplitPieceSec` (`isSplittableBoundary`, ties → earliest; strict `>`).
  Largest-gap split for plain up; end-detach for diagonals (scan from the
  far side, first splittable). Result pieces re-grouped via `asGroup`.
- **Merge (down-swipe):** with nearest neighbor (plain down), or explicit
  left/right (down-left/down-right). **Pinch squeeze** across `low..high`
  merges the whole range: `mergeGap = max gap in [low, high)`.
- After any edit: `activeClip` re-seated to the enclosing group; scope switch
  resets grouping state (§5).
- Slider steppers snap to adjacent detected gaps; thumb drag snaps raw value
  to nearest gap (step 0.005); bubble shows resulting clip count.

---

## 10. Row (single-row) viewport

### 10.1 Window sizing — `getWindowSecs` (exact)

- `getBaseWindowSecs(w)`: `w ≥ 1600 → 32`; `≥ 1200 → 16`; else **12**.
- Empty clips or `w ≤ 0` → base. Else `avg` = CLIP scope → neighbourhood avg
  (≤8 clips centered on `activeClip`, span `(last.vEnd−first.vStart)/n`;
  0 when no selection) else whole-track `duration/n`; fall back to
  whole-track when neighbourhood is 0.
- `minSecond=0.1`; `minWindow=(0.1*w)/60`;
  `ratio=(w−60)/(base−0.1)`; `densityPx=(avg−0.1)*ratio+60`;
  `densitySecs=(avg*w)/densityPx`; `result=max(minWindow, min(base,
  densitySecs))`.
- **Hysteresis (mandatory):** keep the on-screen length unless the fresh value
  differs by more than **1s** — pass the previous length through every
  recompute (iOS currently drops it; do not copy that bug).
- Clamp the final window to `duration`.

### 10.2 Buffer (exact)

- `bufferLen = min(duration, win*3)` (`WAVE_BUFFER_WINDOWS=3`);
  `bufferStart₀ = 0`.
- `calculateBufferStart(viewport) = clamp(viewport − win, 0,
  max(0, duration − bufferLen))`.
- Re-center only when the viewport comes within `win*0.4` of a live buffer
  edge (`WAVE_BUFFER_MARGIN_WINDOWS=0.4`), or forced; ignore moves `< 1e-6`.
- Strip layout = web `updateTrackStyle`: strip width `bufferLen/win*100%` of
  viewport, translation `−(anchor − bufferStart)*pxPerSec`, `pxPerSec =
  viewportWidth/win`. **Compose trap:** constraining a wider strip with
  `Modifier.fillMaxWidth().clip()` centers by default — use explicit
  start-alignment (this exact bug cost a full debug cycle on iOS).

### 10.3 Follow state machine (exact)

Contexts: `manual | follow{epoch} | cursor-hold{epoch, holdUntil} |
clip-follow{start, end, epoch, autoFollow}`; playback: `idle|normal|clip`.

- Epoch: `makeFollowEpoch(anchor, win, t)` → `align = t ∉ [anchor, anchor+win]`.
- `resolveFollow`: `align` → `clamp(t − 0.8*win)`; else hold until
  `t ≥ anchor+0.8*win` (`HS_FOLLOW_FRAC=0.8`), then `clamp(t − 0.8*win)`.
- Advance the anchor **only while playing and not dragging**; a manual pan
  arms `manual` + 1.5s hold (`followPause`), then re-follows only if paused or
  the playhead is back inside (a looping clip never re-arms by itself).
- Tap-seek while stopped arms `cursor-hold` (freeze 400ms,
  `CURSOR_CLICK_HOLD_MS`), then resolves as follow.
- Explicit paused jump landing outside rebuilds a fresh follow epoch (brings
  the playhead back on screen); `resolveFollow` never moves backwards
  otherwise.
- Clip entry (`getClipPlaybackViewport`, `CLIP_PLAY_MARGIN=0.1`): fully
  visible → freeze (`autoFollow=false`); left-hidden → jump to
  `clamp(start−0.1)`, follow only if still not fully visible; right-hidden →
  hold + arm follow. `resolveClipFollow` caps at
  `clipEndAnchor=clamp(end−win+0.1)` and uses per-frame
  `threshold=epoch.anchor+win−0.1`, `target=t−win+0.1`.
- New clip tap always re-arms; loop **repetitions** preserve a manually taken
  viewport; loop end parks the viewport as manual; fresh normal play re-earns
  follow.

### 10.4 Pan / tap / pinch

- Pan: engage after 8px (`HS_PAN_DECIDE_PX`) **and** within 15° of horizontal
  (`|dy| ≥ tan15°·|dx|` aborts to the clip); `anchor −= dx*win/width`
  (drag right = earlier audio), clamped; pan end suppresses the trailing tap.
- Tap empty waveform: `t = anchor + x/width*win`, seek + `activeClip=-1`;
  forbidden while a clip loops or a pinch is live.
- Pinch: squeeze two clips ≥40px → merge range; spread one clip ≥40px →
  split; decided on release; all single-finger gestures stand down while
  two fingers are down; pinch disabled while playing.

---

## 11. Waveform rendering (exact)

Bars algorithm (row `VB 500×100 PAD 4`; stacked row `VB 1000×200 PAD 4`):

- One bar every `barSpacing=3` CSS-px-equivalent dp; `durationPerPixel =
  bufferLen/cssW`; `durationPerBar = durationPerPixel*3`;
  `step = max(1, round(durationPerBar*sampleRate))`, lattice-aligned
  (`latticeStart = floor(bufStart/step)*step`).
- Min/max per slice → 1-2-1 smoothing (`(l+2c+r)/4`) → stroke width 1.6
  (row) / 1 (stacked); spans ≥2px full height (`verticalFill` 0.46 row /
  0.48 stacked of view height, centered), shorter spans become centered
  2px "silent" dashes in the silent color.
- Played portion (`t < playedUpTo`, equivalently `playedFraction =
  (t−bufferStart)/bufferLen` clipped 0–100%) in played color; played silent
  dashes also take the played color.
- Bars colors resolve live from the active theme (no stale captures).

### 11.4 Cursor + time label (exact)

- 2dp accent line, full track height, glow; pointer-events none.
- Pin to the nearest viewport edge when the playhead is outside (nudge 2px
  inside at the right edge; end-of-track epsilon `1e-6` rule).
- Time chip rides at the track **bottom**, centered on the cursor; within 2%
  of an edge (or when pinned) it flips to 6px inside that edge.

---

## 12. Stacked view (exact)

- Row height 64dp; dynamic gap `min(24, max(4, floor(containerH/45)))`;
  `rowsPerPage = max(1, floor(containerH/(64+gap)))`.
- Pack consecutive clips while `clipDur + (cur.end−cur.start) ≤ windowSecs`
  (expanded bounds); first row starts at 0, last row ends at `max(end,
  duration)`; `rowLen = max(windowSecs, row.end−row.start)`; bars stop at
  `contentEndSec = row.end`.
- Horizontal snapped pages of `rowsPerPage` (pad short last page with virtual
  rows for identical rhythm), `n / m` badge; page drag threshold 8px with the
  same 15° arbitration; pinch disengages paging.
- Auto-follow advances **forward only** while playing and not manually held
  (4s hold after a manual page turn); seek deltas `< 1s` ignored; activating a
  clip scrolls to its page.

---

## 13. Clip visuals + gestures (exact)

- Band = middle half of the row (`top=(vbH/2−innerH/4)/vbH`,
  `height=innerH/2/vbH`); 4dp radius; idle accent 32% / active 65% + glow;
  `min-width 0.2%`; label = number badge + `%.1fs` duration, centered in the
  **visible slice** of the clip (recompute on scroll; skip when it cannot fit
  without clipping).
- Tap `< 4px` movement → activate/loop (active + playing → stop); anything
  classified swipe commits on release; horizontal `≥ 4px` belongs to the
  parent (pan/page) and suppresses tap; second finger down voids tap-ability.
- Direction slices: diagonals 15–75° from horizontal
  (`tan15°≈0.2679`, `tan75°≈3.7321`, distance ≥10px) → up-right/up-left splits
  (end-detach), down-right/down-left merges (explicit side); steeper than 75°
  (`|dy|≥10`) → up split / down merge.
- During a classified drag show the ✂️/🔗 hint **above the fingertip**
  (translate −50%, −100% − 20px); static ✂️ affordance straddling the active
  clip's top edge only when `canSplit`.

---

## 14. Toolbar / playlist / now-playing / dancing lines

- Toolbar below the panel: global-scope-only merge slider + reps stepper
  (1–20); hide on 24px downward swipe, re-show on 24px upward swipe from the
  collapsed strip; locked while a clip loops or audio plays.
- Playlist modal: count header, `+` import (multi), tap-to-play, ✕ remove
  (current → nearest survivor), empty hint.
- Now Playing card: `title — artist`, meta line, animated note icon, max width
  ~480dp.
- Dancing lines: 56 bars, bottom-anchored, accent 80%; live analyser spectrum
  where available, else decoded-sample fallback — window `[t−0.03−0.32,
  t−0.03]`, `perBar=span/56`, stride `perBar/4`, peak per bar,
  `target=min(1, peak^0.55*3)`, `level+=(target−level)*0.2`, heights
  `max(3dp, level*(H−8dp))`.

---

## 15. File import (Android specifics)

- System picker, multi-select; accept **mp3, wav, ogg, m4a, flac, webm**
  (web's list — engine plays all six via ExoPlayer; do NOT copy iOS's
  Apple-codec list or its picker/engine mismatch that advertises ogg/webm but
  rejects them).
- Copy into app storage with `base-counter.ext` dedup (persist across
  restarts, like iOS `Documents/`); `id` = UUID, title = filename sans
  extension, artist `Unknown Artist`.
- Autoplay first added when requested or when the list was empty; report
  skipped count via notice (`app.skippedNonMp3` / plural key).

---

## 16. Notices / empty / loading / error states

- Toast (`role=status`), auto-dismiss **4s**: skipped-file counts, errors.
- `Loading waveform…` (spinner) / `Waveform unavailable` (error) /
  `No clips detected — lower the Silence threshold` (ready but empty).
- Crash boundary screen (`errorBoundary.crashed`) — iOS lacks this; include it.

---

## 17. Themes (port verbatim — do not redesign)

10 themes (system + 9 palettes), 22 variables each — copy exact values from web `src/themes.ts`
(iOS `Theme/Theme.swift` is the same data in Swift):

| id | name key | light/dark |
|---|---|---|
| system | System (follows OS → `dark` when dark, `light` when light) | dynamic |
| dark | Slate | dark |
| light | Mist | light |
| midnight (default) | Midnight | dark |
| paper | Sky | light |
| nova | Nova | dark |
| rose | Lilac | light |
| qinghua | Qinghua | dark |
| yingluo | Yingluo | light |
| norge | Norway | light |

Variables per theme: `bg-primary/secondary/tertiary/hover/panel`,
`text-primary/secondary/tertiary`, `border`, `danger`, `waveform-bg-top/mid`,
`waveform-bar/-silent/-played`, `clip-label-bg/text/border`, `clip-swipe`,
`accent/accent-dim/accent-rgb`, `colorScheme`. Waveform Canvas must resolve
colors live so theme flips apply without stale captures.

---

## 18. i18n (port verbatim — do not redesign)

- Locales `en, zh, no` (that order); default **`no`** (both references;
  yes, really — keep, it is intentional in code though the web comment says
  otherwise).
- Namespaces: `common, player, actions, nowPlaying, playlist, trackList,
  emptyState, reps, merge, viewFlip, settings, themes, app, waveform,
  errorBoundary`. `{name}` interpolation; missing key → fall back to `en`,
  then the key itself.
- String-parity tests per locale (web `translations.test.ts`).

---

## 19. Platform integration

- Media3 `MediaSessionService` + notification: title/duration/position,
  play/pause/prev/next (**same two-step park-or-change handlers as the UI
  buttons**, §22.1), seek-to, artwork (app icon gradient fallback like iOS).
- Skip-forward/backward session actions use `skipSeconds` (ignore any fixed
  15s default), matching iOS behavior.

---

## 20. Accessibility

TalkBack labels on every control (port the web ARIA strings 1:1, including
`clip.accessibilityLabel` / `clip.accessibilitySplittable`), content
descriptions on canvas views, focus return after closing playlist/settings,
minimum 48dp touch targets where the design allows (clip bands keep exact
geometry).

---

## 21. Testing (mirror the web matrix)

Unit (JUnit): clip detection/merge/split incl. `isSplittableBoundary` ties;
 swipe scope semantics; `getWindowSecs` incl. hysteresis + neighbourhood;
 pan target; follow/clip-follow viewport vectors; gesture classification incl.
 diagonal bands; pinch thresholds; locale completeness; selectors/derived
 state. UI (Compose/Espresso): toolbar wiring, pinch, clip-play loop ×N with
 fake clock, stacked auto-advance, cursor/label pinning, playlist add/remove,
 settings persistence round-trip. Manual: real-device decode→clips→canvas on
 a mid-range phone (full MP3 decode ≈ web's 60s e2e budget concern).

---

## 22. Resolved divergences (decisions — normative for Android)

| # | Issue | Decision |
|---|---|---|
| 1 | Prev/next remote keys: web buttons are two-step (park-or-change) | Remotes use the **same two-step handlers as the UI buttons** (`skipToStart`/`skipToEnd`); skip lives in dedicated skip actions |
| 2 | Formats: web 6 (mp3/wav/ogg/m4a/flac/webm); iOS picker advertises ogg/webm but engine rejects | Accept the web's 6; picker list MUST equal engine list |
| 3 | Playback path: web WAV re-encode; iOS direct file | **Direct file** (ExoPlayer needs no re-encode) |
| 4 | Visualizer: web live analyser on desktop, fallback on iOS | Live analyser where the platform allows, else §14 fallback |
| 5 | `silenceRatio` slider (to 0.1) vs detector clamp (0.01) | Capped at 0.01 on both (dead range removed; presets `[0.005, 0.01]`; legacy stored values clamp on load, behavior unchanged) |
| 6 | Window hysteresis dropped in iOS row view | `previousWindowSecs` wired through row + stacked (web behavior) |
| 7 | Storage key | `listenoop_config`, with one-time migration from the legacy iOS `Listeenoop_config` key (do not ship the typo) |
| 8 | Docs (`SPEC.md`, settings table, README view default) | Treat as stale; this spec + tests are authoritative |
| 9 | Waveform "zoom" | Does not exist in either implementation; out of scope |
| 10 | Cursor under active clip (z-order) | Match web (cursor beneath active band); revisit only on complaint |

---

## Appendix A. Constant table (normative)

`TARGET_CLIP_WIDTH_PX 60 · WINDOW_HYSTERESIS 1s · NEIGHBOURHOOD 8 ·
BASE_WINDOWS 32/16/12 @ ≥1600/≥1200/else · MIN_SECOND 0.1 ·
FOLLOW_FRAC 0.8 · BUFFER_WINDOWS 3 · BUFFER_MARGIN 0.4 · PAN_DECIDE 8px ·
CURSOR_HOLD 400ms · MANUAL_HOLD 1.5s · PAGE_HOLD 4s · CLIP_MARGIN 0.1 ·
TAP 4px · SWIPE 10px · DIAG tan15°–tan75° · PINCH 40/40px · TOOLBAR_SWIPE 24px ·
VB row 500×100 PAD 4 · VB stacked 1000×200 PAD 4 · BAR_SPACING 3px ·
STROKE 1.6/1 · FILL 0.46/0.48 · MIN_BAR 2px · DANCE 56/0.2/3dp/0.32s/0.03s ·
BAND middle-half · MIN_CLIP_W 0.2% · LABEL_EDGE 6px/2% · EDGE_TOL 0.05s ·
EXPAND 0.25 · GAP_EPS 0.01 · MERGE_EPS 1e-6 · SNATCH 0.08 · NEAR_START
[−0.05,+0.15] · ABORT −0.05 · RECOVERY 3s×1 · RESUME 50ms · TICK 60Hz ·
REPORT Δ 0.016s · NOTICE 4s · REPS 1–20 · SKIP 1–60s · ROW_H 64dp`

## Appendix B. Source map (where each behavior is defined)

Web `src/`: viewport math `utils/rowWaveform.ts` · strip/cursor/label styles
`utils/{waveform,cursorStyle,clipLabels}.ts` · loop `hooks/useAudioPlayer.ts`
(playRange ≈ L540–720) · pan `utils/pan.ts` · gestures `components/Clip.tsx`
(thresholds ≈ L75–158) + `clipPinch.ts` · detection `utils/clips.ts` ·
scopes `utils/swipe.ts` · state `store/*Slice.ts` · strings
`i18n/translations.ts` · palettes `themes.ts`.
iOS `Sources/Listenoop/`: viewport `Views/Waveform/RowWaveformView.swift` ·
loop `Audio/AudioEngine.swift` · detection `Models/ClipDetector.swift` ·
sizing `Utilities/WaveformWindow.swift` · gestures
`Views/Waveform/{ClipLayerView,PinchClipSupport}.swift` · state
`Store/AppState.swift` · config `Config/AppConfig.swift`.
