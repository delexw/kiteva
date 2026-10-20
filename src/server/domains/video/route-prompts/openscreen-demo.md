# OpenScreen demo workflow — upstream steps 2–7

Source: https://github.com/getopenscreen/openscreen/blob/main/plugin/skills/openscreen-demo/SKILL.md
Copied on 2026-10-20. Steps 2–7 are reproduced below; setup, pull-request publishing and social posting are excluded.
License: MIT; see openscreen-demo.LICENSE alongside this file.

## Kiteva binding (read before the upstream steps)

This is the single production workflow for Route A and Route D's demo sections. The route defines main-feature coverage, chapter cards and the saved renderer; this skill defines recording, review and native editing. The user's duration, selected Motion Graphics, act directions and audio settings take precedence over the short launch/PR examples below. In read-only plan mode, plan these steps; execute them during implementation through the existing planning handoff.

Use `reference_browser/capture_video` as the adapter:

- `action: "start"`: choose presentation (2D cursor theme and framing). Interact with the same isolated browser using its inspection, click, fill, scroll and wait tools. Kiteva supplies the scripted pointer track; do not use the normal browser, physical mouse, `listSources`, `startRecording` or `setPointerTrack` yourself.
- `action: "stop", recordingId`: stops recording without exporting and returns the native operations' live descriptions and argument schemas. Keep the recordingId; the adapter binds its native project automatically.
- `action: "edit", recordingId, native: { operation, arguments }`: calls the named OpenScreen operation. Use `getFrames` to review, `getCurrentDocument` before editing, then the native trims, speed, zoom, annotation and checkpoint operations described below. Omit projectId and paths. Read source-time versus virtual-ruler seconds and transition windows from the native document; do not infer edit times from an exported video's clock. Check partial refusals and `cutTransitions` warnings. During frame review, verify that the complete active field, its label and relevant text remain visible; correct framing or zoom through native tools when needed. Kiteva does not calculate or inject input-focus zooms. The adapter only exposes native operations supported by this take; it does not expose unrelated projects or imports.
- `action: "export", recordingId`: native OpenScreen export with automatic zoom and 60 fps, then validated silent WebM delivery. Review again using `getFrames`; correct the native project and re-export if needed. Only exported assets enter the film inventory. Cursor and zooms are already rendered; use the footage directly without another cursor/zoom layer. The sidecar retains source-recording timestamps and native trim provenance, not edited-video cue times.

Native trims apply the agent's decisions; they do not detect dead time. No Kiteva heuristic chooses cuts or changes the timeline. Smart cuts requires a separate connected provider and is not an implicit part of this binding. Optional upstream operations absent from the returned native tool list may be omitted; if a required operation or feature is unavailable, use the existing blocking question flow rather than inventing an action or silently substituting illustrations. Keep existing origin/data boundaries, 120-second take limits and six-take budget. Copied commands are examples, not permission to install software or publish anything.

---

## 2. Plan before recording

Write a storyboard and show it to the user in a few lines, then carry on unless they object.

- **One message.** What should a viewer remember after 3 seconds? The first beat shows the result, not a setup screen.
- **Launch demo: 3 to 6 beats, 20 to 60 seconds.** Each beat is one action and one callout of 6 words or fewer. X autoplays muted, so the callouts carry the story, not a voice.
- **Pull request video: 1 to 3 beats, 10 to 30 seconds.** Show what the change does, not the whole product: the new behavior, or the bug no longer happening. The pull request text explains the rest, so one short callout per beat is enough.
- **Realistic data.** Seed the app with believable content. No real customer data, secrets, tokens or personal notifications on screen.

## 3. Set the stage

- Start the app and open it on the starting state of the first beat.
- Give it one clean window of about 1600×1000. For a web app, open it in an app window without browser chrome: `chrome --app=http://localhost:3000 --window-size=1600,1000 --user-data-dir=<temp folder>`. Its title is the page's `<title>`.
- Call `listSources` and pick a unique part of the window's title.
- **Only the app on screen.** No browser toolbar, address bar, local file path, user name, bookmark bar, translation prompt or notification in the recorded window. Recording one window keeps the rest of the desktop out.

## 4. Record

1. `startRecording` with `window`. It returns once capture has started. Connected to the server in the app, the take goes through OpenScreen's recording bar: the editor closes, the bar counts down, and `stopRecording` opens the take in the editor. Pass `camera` only when the user wants to appear on screen: the webcam then shows as a picture-in-picture. Pass `microphone: true` when the user narrates: without it the take has no voice, and nothing to caption.
2. Play the storyboard. Move deliberately, and pause about one second after each result appears.
3. `stopRecording` with a `title`. Keep what it returns: `projectId`, `checkpointId`, `videoPath`, `recordingStartedAt`.

**How you drive the app decides the cursor.**

- **Real mouse** (computer-use, or any tool that moves the actual pointer): OpenScreen records the pointer, draws a clean cursor and already zooms on the clicks (see _Zoom on the action_ below). If your mouse tool cannot click in the app's window (some only read browsers, for one), drive it from a script instead.
- **A script** (Playwright, CDP): the screen pointer never moves, so the take has no cursor and no zoom. In the script, log every action as it runs: `at` is `Date.now()`, `x` and `y` are the action's position as fractions of the window, `click` is true for a click. Hand the log to `setPointerTrack` after `stopRecording`; its description gives the formula from a page's coordinates. A script also gives the cleanest take: same timing on every run, no hesitation.

**A video you already have** needs no recording: `createProject` with its absolute `videoPath` lays it out as a project, and returns a `projectId` and a `checkpointId` as `stopRecording` does. Check it as a take in step 5, its `videoPath` included, then go on from step 6.

## 5. Check the take

`getFrames` on the `videoPath`, about 6 frames. Is it the right window? Is anything private visible? Did every beat happen? If not, record again: a new take costs less than a fix in editing.

## 6. Edit

Use the document tools, always with the `projectId`. Read the project first with `getCurrentDocument`: its notes say which times are in the recording's seconds and which on the editor's ruler.

**One clock.** Place every effect in ruler seconds, and look at the result with `getFrames` and the `projectId`, which takes the same seconds. Never read times off the exported file: a cut or a speed-up shifts its clock away from the ruler.

- **Format first:** `setAspectRatio` for where the video will be shown, `16:9` for X. Do it before placing text.
- **Cut dead time:** the setup at the start, the stop at the end, any wait. Use `addTrims`, or `addSpeed` to fast-forward a wait instead of cutting it.
- **Zoom on the action:** clicks close in time and on screen share one zoom, and the first 2.5 s stay wide. Check them, then add or move zooms with `addZooms` and `setZoom` where a result deserves its own. Hold a zoom at least 1.5 s. After a cut that removed some, `addAutoZooms` plans them again on the clicks left, clear of the zooms still there.
- **Frame the app:** when the take shows more than the app, `setClipRange` with a `cropRegion` crops the clip to it.
- **Callouts:** one `addAnnotation` per beat, short, placed clear of the action. Text sits on the output frame and stays put when the picture zooms. Use its look for hierarchy: a large title with `animation: "typewriter"`, step callouts with `animation: "pop"`. An arrow, `type: "figure"`, points at a control the text names. `setAnnotation` moves or restyles one.
- **Hide what is private:** an email address, a token or a name that shows on screen gets `addAnnotation` with `type: "blur"` over the span it is visible. Its x, y, width and height are percent of the recording's picture, not of the frame, so it stays on what it hides when a zoom moves the picture. Check it with `getFrames`.
- **An effect no setting offers** (a ripple on each click, a glitch on a cut, a color grade): read the resource `openscreen://effects/contract`, then write it as WGSL with `addEffect`. It reads the clicks and the pointer already placed on the frame. Code that does not compile comes back with the compiler's error at your line: fix it and call again. The result gives a cost tier; keep heavy effects to short spans. Check the effect with `getFrames` at the moments it acts.
- **Music or a voiceover:** `importMedia` with the file's absolute path adds it to the project's media, then `addAudio` plays it over a span. `removeMedia` takes back a file the timeline no longer uses.
- **Name:** `setProjectInfo` renames the project, if the `title` given to `stopRecording` no longer fits.
- **Captions, for a narrated take** (`startRecording` with `microphone: true`):
  1. `transcribe` with the `projectId`. Whisper runs on this machine and can take a minute; a take has no transcript before this.
  2. `setCaptionSettings` with `enabled: true` and a `style`, plus `anchorV`, `insetY` or `maxWordsPerLine` if the callouts need room.
  3. To caption in another language: `getCaptionTranslationUnits` with the `language`, translate each unit yourself as a whole phrase, store them with `putCaptionTranslation`, then `setCaptionSettings` with that `language`.
  4. `getCaptions` reads it all back. The export burns the captions in.
     A misheard name is fixed with `setWordText` (or `setVocabulary`, then `transcribe` again with the `language`), a flubbed phrase cut with `getTranscriptWords` and `removeWords`.
- **Undo:** `restoreCheckpoint` with the `checkpointId` takes the project back to the raw take in one step. It also puts back the take's own pointer track, undoing any `setPointerTrack` made since.
- **Open in the app:** while OpenScreen is running, your edits go through it, so a project the user has open in its editor changes there live and they can undo each edit. If an edit is refused as "open in the OpenScreen editor", the app did not answer: retry once, then ask the user to close the project there or restart OpenScreen.

Keep the rest as it is: the background, padding, shadow and cursor style are chosen to look good. When the user asks for a different look, `setEditorSettings` sets it (background, frame, camera layout, cursor, volume); `getCurrentDocument` shows the current values under `settings`, and `settingsContext.inactive` says which ones would change nothing right now.

## 7. Export and review

1. `exportVideo` with the `projectId` and an absolute path: resolve, say, `demo/demo.mp4` against your working directory first, since the server in the app refuses a relative path. For a pull request video, pass `quality: "medium"` (720p) to keep the file small. For a GIF (a README, say), end the path in `.gif` and pass `gifSize: "small"` (480p).
2. `getFrames` with the `projectId`, at the ruler seconds of your beats. While you edit, you can call it before exporting: without a current export it renders the frames the export would show.
3. Check every frame:
   - Is each callout readable and clear of the action?
   - Is each zoom on the thing that changes?
   - Are there black frames, cut-off text or a leftover setup screen?
4. Fix the project and export again until it holds.

Never commit the video to the repository: it goes into the pull request or the post, not the code.
