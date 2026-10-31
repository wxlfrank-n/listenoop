# <img src="public/favicon.svg" width="28" height="28" alt="Listeenoop icon" style="vertical-align: middle;"> Listenoop

A browser-based music player for audio files that automatically breaks each track into **clips** (segments separated by silence) so you can practice, loop, and repeat specific parts.

![GitHub language](https://img.shields.io/badge/react-19-blue) ![typescript](https://img.shields.io/badge/typescript-5.6-blue) ![vite](https://img.shields.io/badge/vite-8-purple)

## Features

- **Audio playback** (MP3, WAV, OGG, M4A, FLAC, WebM) with waveform visualization
- **Automatic clip detection** — adaptive RMS energy detection groups sound around sustained pauses, with automatic gap grouping and proportional playback padding
- **Clip looping** — click any clip to play it, repeating it up to 20 times
- **Merge control** — combine neighboring clips into one with a single slider
- **Two waveform views** — a stacked multi-row overview or a single horizontally-scrollable row
- **Configurable skip** — jump forward/back by 5–60 seconds
- **File picker** — load multiple audio files at once
- **Live frequency visualizer** ("dancing lines")
- **Settings persist** automatically in your browser's local storage

---

## Getting started

### Running locally (development)

```bash
npm install
npm run dev
```

This starts the Vite dev server (default: <http://localhost:5173>). Open that URL in your browser.

### Building for production

```bash
npm run build        # compiles TypeScript, builds to docs/ (VITE_OUT_DIR)
npm run build:local  # copies output into .local-deploy/<folder>/ for VITE_BASE_URL=/folder/
npm run preview      # serves the built app to verify it
```

### Project scripts

| Command              | Purpose                                             |
| -------------------- | --------------------------------------------------- |
| `npm run dev`        | Start the development server with hot reload        |
| `npm run build`      | Type-check and build the production bundle          |
| `npm run build:local`| Build and copy output into .local-deploy/<folder>/    |
| `npm run preview`    | Preview the production build                        |
| `npm run serve`      | Alias for `preview`                                 |
| `npm run test`       | Run the unit test suite (Vitest)                    |
| `npm run lint`       | Lint the codebase (GTS / ESLint)                          |

---

## Loading music

Local deployment copies use `.local-deploy/<folder>/` for a base URL such as `/folder/`. A root base URL skips the copy. The source follows `VITE_OUT_DIR` (default `dist`). Unsafe paths and symbolic links at the deployment folder are rejected. Existing files are preserved, so old hashed assets may remain after rebuilding.

1. Click the **playlist** button in the top-left corner to open the playlist panel.
2. Click the **`+`** button and select one or more audio files.

Notes:

- Supported formats are **MP3, WAV, OGG, M4A, FLAC, WebM**. Other files are skipped and a notice tells you how many were ignored.
- A built-in sample track (`01A.mp3`) is loaded on startup so you can explore the player immediately.
- All files are processed locally in your browser — nothing is uploaded.

---

## The player

### Now Playing

The large card shows the current track's title, artist, and audio metadata (channels, sample rate, bitrate). The music-note icon animates while audio is playing.

### Playback controls

The bottom button row provides:

| Control            | Action                                                       |
| ------------------ | ------------------------------------------------------------ |
| **Back** (large)   | Skip backward by the configured interval (default 10s)        |
| **Previous**       | Go to start; press again at the start to load the previous track |
| **Play / Pause**   | The main play/pause toggle (shows a loading state while decoding) |
| **Next**           | Go to end and stop; press again at the end to load the next track   |
| **Forward** (large)| Skip forward by the configured interval (default 10s)        |

The large skip buttons display the current skip interval (e.g. `10`), and all controls are disabled until a track has loaded.

### Waveform

The waveform is drawn from the decoded audio and shows:

- the wave shape in gray, with **played** audio highlighted in blue,
- the **playhead cursor** with a floating time label,
- **clip regions** — highlighted rectangles over each detected clip, with a numbered badge and duration label above each one.

#### Seeking

- **Click anywhere on the waveform** to jump the playhead to that position.

#### Two views

- **Stacked** — each ~10-second group of clips is shown as its own row so you can see the whole track at once. The container scrolls to keep the playhead in view while playing.
- **Single row** — one horizontally-scrollable row you can **pan** (drag); it automatically follows the playhead during playback (auto-follow pauses for 1.5s after you manually navigate).

Switch views in **Settings → Waveform view**.

---

## Clips & looping

This is the heart of Listeenoop. The player detects quiet gaps in the audio and splits the track into **clips** — ideal for practice segments, exercise cues, or listening to specific parts on repeat.

### Playing a clip on repeat

1. Make sure **playback is stopped** (the clip toolbar is disabled while playing).
2. Set how many times the clip should play with the **Repeat** stepper (`1`–`20`).
3. **Click a clip** on the waveform. It plays from that clip's start to its end, then restarts until the repeat count is reached.

- Clicking anywhere on the waveform (outside a clip) seeks the playhead. While a clip is looping, background taps are ignored — tap the active clip to stop it.
- While a clip is looping, the toolbar (merge slider + repeat stepper) is locked; pause/stop to change settings.

### Merging clips

Suppose two neighboring clips are really one phrase. Use the **merge slider**:

- Drag the slider thumb, or use the **`–` / `+`** steppers on either side, to choose the *maximum silent gap* that should be treated as a single clip.
- A floating bubble shows the resulting clip count (e.g. `4 clips`).
- The slider snaps to the actually-detected gap lengths in your track, so you always end up with a real (not arbitrary) grouping.

### Fine-tuning with swipes

On the **active clip**, two arrows may appear above the label:

- **Swipe up** — split a merged clip back into its individual sub-clips (available when the active clip contains multiple children).
- **Swipe down** — merge the active clip with its neighbor (available when there is a neighbor).

Swiping updates the merge threshold automatically and keeps the active clip in view.

---

## Settings

Open the **Settings** panel with the gear button in the top-right. Every option is saved to local storage automatically and restored next time you open the app.

| Setting                | Options                     | Default | Description |
| ---------------------- | --------------------------- | ------- | ----------- |
| **Waveform view**      | Stacked / Single row        | Single row | How clips and audio are displayed |
| **Skip forward / back**| 5, 10, 15, 20, 30s (or 1–60s custom) | 10s | Interval used by the large skip buttons |
| **Silence threshold**  | 0.005–0.02 | 0.01 | Sensitivity of the relative RMS and estimated noise-floor thresholds. **Lower** values retain more quiet sound |
| **Analysis detail** | 6 / 12 / 24 / 48 (or 2–64ms) | 12ms | RMS window size. Smaller windows give finer timing; larger windows smooth brief changes |
| **Minimum clip length** | 0.3–1s | 0.3s | Detection tries to join shorter clips with a neighbor |

> Detection settings recompute clips for the current track automatically and reset manual clip grouping. Settings remain usable for the current session if browser storage is blocked or full.

---

## Playlist

- Open the playlist from the **playlist** button (top-left).
- Click a row to play that track (the current track is highlighted).
- Remove a track with the **✕** button on its row.
- The track count is shown in the panel header.

---

## Notes & troubleshooting

- **Audio formats** — MP3, WAV, OGG, M4A, FLAC, and WebM are accepted; other files are skipped and a notice shows the count.
- **Data stays on your device** — audio is processed locally without uploading it. Settings persist in browser storage. Imported files, playback position, and manual clip edits last for the current page session; select files again after reloading.
- **iOS / iPhone** — WebKit's audio-routing limitation means the live frequency visualizer has no live analyser data; as a fallback the dancing lines are derived from the decoded waveform around the playhead, so they still animate.
- **Audio playback** may require a user gesture (browser autoplay policy) — tap Play to start. If playback fails, use **Retry** to reload the track or **Next track** to continue.

---

## Support

Report issues or give feedback at the project's issue tracker.


### Adaptive silence detection (web preview)

The web detector measures overlapping RMS windows, estimates a recording noise floor,
uses separate start/stop thresholds, and rejects energy bursts shorter than about 25 ms.
The sensitivity control affects both relative energy and noise-floor thresholds.
This is an energy detector, not a speech recognition model: music, breath and changing
background noise can still be classified as sound.

Initial grouping uses `initGap`, the arithmetic average of the sorted, distinct
positive values returned by `getClipGaps`, or zero when there are no gaps.
With one detected gap, that gap is selected and the two intervals are initially
grouped. Manual split/merge remains available.
By default, playback padding extends each interval into 25% of the surrounding
silent gaps; Expansion rate can increase this to 40%.

Existing settings migrate automatically. This preview changes web only; the mobile
apps retain the previous detector until the web behavior has been evaluated.

**Minimum clip length** is the single duration constraint. Settings defaults to
0.3 seconds and offers a range of 0.3–1 seconds; the detector itself uses
`options.minClipLength` directly without imposing a separate constant floor. Before `expandClips`, every shorter detected interval merges across
its nearest gap. If the final isolated interval is still too short, no clip is
returned for it; normal track playback remains available. The constraint uses
`end - start`, including any internal pauses in a merged interval, and never
counts playback padding. Manual splits must leave both resulting intervals at
least this long. The former **Minimum split piece** setting and the post-expansion
minimum-length merge-gap search have been removed.


Waveform window sizing uses `max(viewportWidth, 600) * minClipLength / 27`.
Above the 600px reference width, a minimum-length clip occupies 27px. Smaller
screens retain the reference time window. Changing the minimum clip length
updates both horizontal and stacked waveform scales immediately.


**Expansion rate** in Settings → Clip detection controls how much of each
surrounding silent gap is included in playback: default/minimum 0.25, maximum
0.4, adjustable in 0.01 steps. It is saved automatically and applies immediately.
Expansion changes playback bounds only; detected sound bounds and the minimum
clip-length constraint remain unchanged.
