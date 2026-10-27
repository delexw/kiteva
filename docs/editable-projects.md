# Editable project downloads

[English README](../README.md#editable-project-downloads) · [中文 README](../README.zh-CN.md#下载可编辑项目)

In a project's **Full versions** tab, **Download editable project** appears once the job has exportable files. It does not require a successful build: failed, cancelled, interrupted and still-running jobs can expose their available files. The UI checks availability periodically. The archive is a snapshot taken when requested; it does not repair or finish a build.

The same export mechanism handles HyperFrames, Multiplane and the Remotion fallback. Existing HTML-page downloads retain their root-level page layout.

## Video ZIP contents

| Path                                              | Contents                                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `timeline.otio`                                   | OpenTimelineIO editing timeline with scene clips and available audio tracks                        |
| `captions.srt`                                    | Timed subtitle text from the saved storyboard; empty if no valid subtitle cues exist               |
| `media/visuals.mp4`                               | Available rendered video with its audio removed, copied without re-encoding                        |
| `media/music.*`, `media/narration.*`              | Available separate audio files                                                                     |
| `media/reference-mix.wav`                         | Audio extracted from the rendered video, when present                                              |
| `source/`                                         | Available renderer code, assets, fonts, footage, storyboard and production files                   |
| `source/package.json`, `source/package-lock.json` | Existing project dependency files, or Kiteva's dependency snapshot when no project manifest exists |
| `export.json`                                     | Job phase, identified renderer/entry point, video availability and warnings                        |
| `README.txt`                                      | Instructions and limitations for that export                                                       |

Not every path exists in every export. Agent configuration, hidden files, prompt-input directories, selected internal context files, symlinks and `node_modules` are excluded. ZIP delivery is streamed rather than buffered behind the former 100 MB limit.

ZIP generation is registered as project-owned work. A disconnected download or project stop
aborts the export and closes its streams; deletion waits for settlement. See
[project work and cancellation](process-lifecycle.md).

## How the timeline is built

1. Read a valid `STORYBOARD.json` for scene names and time ranges.
2. If a usable rendered video exists, create one video clip per storyboard scene. Clips reference ranges of the shared `media/visuals.mp4`; they are not separate physical scene files. Without a valid storyboard, use one clip for the available video.
3. Add available music and narration on separate tracks. These start at zero, matching Kiteva's current narration mixing behavior; the exporter does not infer a new speech schedule from prose instructions.
4. Preserve the rendered audio mix. If no separate music file is available, use that mix on the timeline instead of the separate stems, avoiding duplicate narration and missing renderer-authored audio. Separate files remain available for manual editing.
5. Export timed `audio.subtitles` entries from storyboard beats as SRT cues, merging adjacent identical lines. Captions are a sidecar, not an OTIO text layer.

Kiteva uses the `otio.js` timeline model with a compatibility adapter for OTIO time-object schema tags. The serialized format has been checked using the official OpenTimelineIO Python reader. That confirms format compatibility, not feature-by-feature import in every editor.

The exporter does not recreate procedural graphics, camera effects, animation curves, transitions or music ducking as native editor effects. Video-track cuts follow storyboard scene boundaries; changes within a scene remain in the rendered pixels.

## Open and edit

Unzip the entire archive first, keeping its relative paths intact. Open `timeline.otio` in an editor with OTIO import support, then import `captions.srt` separately if supported. Some editors require an adapter or plugin; import support varies.

Use either the separate audio tracks or the reference mix, never both together. When the timeline defaults to the reference mix, replace that track if you want to rebuild the mix from the available stems.

For changes inside motion graphics, edit the original sources in `source/` using the original renderer:

- **HyperFrames:** HTML composition and timeline sources with the HyperFrames CLI/Studio.
- **Multiplane:** shot HTML/JavaScript, assets and any ordered-shot production manifest with its CLI.
- **Remotion:** React composition sources with Remotion Studio/CLI.

Install the source dependencies as needed. A native project is not converted into another renderer's project format. Code-drawn content may still require code changes rather than visual layer editing.

Already-burned graphics and captions stay inside the video pixels. Editing the SRT does not remove existing captions; change the renderer sources and render again to replace them cleanly.

## Failed and incomplete builds

Available sources can be downloaded before rendering succeeds. If there is no usable final render, the OTIO video track is empty; the ZIP still includes available sources and audio. The exporter does not render missing scenes or manufacture placeholders. Missing-media warnings are recorded in `export.json` and `README.txt`.

## Implementation

- [Archive and availability](../src/server/project-export/bundle.ts)
- [OTIO and SRT construction](../src/server/project-export/timeline.ts)
- [Download control](../src/client/components/project-download.tsx)
- [OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO)
