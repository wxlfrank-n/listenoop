# Mobile parity review — 2026-10-30

Reference: the current working source in listenoop-web, including uncommitted changes.
Mobile source reviewed: listenoop-ios/Sources/Listenoop and listenoop-android/app/src.
The nested archive copies are not build inputs and were left untouched.

## Shared behavior found in source

| Area | Expected behavior across clients |
| --- | --- |
| Transport | Play/pause, configurable skip, seek; start/end buttons first park paused, then cross tracks on a second press |
| Playlist | Import multiple files, play the selected track, remove tracks, bundled sample; end-of-track advance only when playlist looping is enabled |
| Clips | Silence detection, finite repetition count, swipe split/merge, directional split/merge, clip/global scope, paused pinch editing |
| Waveform | Horizontal and stacked views, clip-follow rounds and manual viewport movement |
| Controls | More menu with playlist/settings, collapsible advanced toolbar, merge control in global scope |
| Preferences | Matching defaults and numeric bounds, ten themes, Norwegian/English/Chinese |

These are source-level findings, not device acceptance results.

## Corrections in this review

- Both mobile apps reject nonfinite stored numbers and constrain numeric settings to web ranges; skip seconds and detection block size round to whole numbers.
- Both invalidate pending waveform work when unloading the last track, clear clip loops, and reset old analysis during track changes.
- Android resets play intent before loading another track, preserving paused navigation.
- iOS clears its parked-end marker on seek, timed skip and clip playback; natural end positions also cross tracks on the next end-button press.
- iOS remote play and pause commands are idempotent.
- Android system controllers route play/pause, skip and track navigation through the app actions; skip commands read the current configured interval.
- Both expose localized playback errors with an explicit retry action that reloads the current track and its analysis.
- Delayed clip repetitions identify the actual loop instance so callbacks from an earlier loop cannot resume a later one with the same start time.
- iOS recomputes detection after setting new configuration, avoiding reads of the previous value from a pre-assignment Published notification.

## Platform differences and remaining verification

- iOS accepts formats supported by AVAudioPlayer; OGG/WEBM are excluded. Android and web accept MP3/WAV/OGG/M4A/FLAC/WEBM; actual codec support depends on the platform.
- Native playlists persist copied files across app restarts; web file selections are session-local.
- iOS uses decoded-sample visualization instead of a live frequency analyser, as web does on iOS.
- Android system skip commands use the current preference; changes to an already-visible system controller's displayed skip label still need device verification.
- An iOS build and side-by-side device checks remain required. This Windows environment has no Swift/iOS compiler on PATH.

## Device acceptance checklist

1. Compare first launch, empty playlist, import, cancel, unsupported or damaged files, and removing the last track while analysis is pending.
2. Check start/end navigation paused and playing, natural completion with playlist loop off/on, and seek away from a parked end.
3. Repeat clips including the last clip, pause during a repeat delay, and rapidly restart the same clip; no canceled callback should resume playback.
4. Compare swipe directions, paused pinch merge/split, global merge slider, and both waveform views through repetitions and manual scrolling.
5. Change detection settings and reset preferences; confirm immediate clip recalculation and persistence after relaunch.
6. Check errors/retry in all three languages, all themes, small screens, large system text, and screen reader focus/labels.
7. Check lock-screen and headset play/pause, track navigation, seeking and audio interruption recovery.
