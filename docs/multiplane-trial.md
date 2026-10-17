# Multiplane trial renderer and WebM previews

HyperFrames stays the default renderer. A project can choose **Multiplane · trial** under
Renderer in its video settings. That choice is saved with the project request, so its
direction previews, regenerated previews and the full film all use Multiplane. Every other
project keeps HyperFrames.

## Source and install

- Package: [`multiplane@0.3.8`](https://www.npmjs.com/package/multiplane) on the npm registry.
  It is published from [github.com/LBEILC/Multiplane](https://github.com/LBEILC/Multiplane),
  under the Apache-2.0 licence. The tarball's sha512 integrity is recorded in the lock file.
- It is a normal dependency in the app's `package.json` and `package-lock.json`, pinned to
  0.3.8. Multiplane 0.3.8 declares an exact, optional peer of `three` 0.180.0; the app's
  `overrides` entry (`"multiplane": { "three": "$three" }`) points it at the app's own `three`, so
  the app and Multiplane share one copy (0.186.1). Multiplane keeps its own exact `playwright`
  1.63.0 inside `node_modules/multiplane`.
- `npm install` installs it. The package's only install script downloads Playwright's Chromium
  (revision 1243), which is already in `~/Library/Caches/ms-playwright`; if it is missing, run
  `node node_modules/multiplane/node_modules/playwright/cli.js install chromium`.
- Requirements: Node 24 or newer, and FFmpeg with libx264 (WebM output also needs libvpx-vp9).
- Multiplane runs inside the app's render sandbox, like HyperFrames: no outside network, no
  private folders. It gets `MULTIPLANE_HOSTED=0` and `--no-hosted`, so renders never pass to the
  desktop app. Its settings folder lives in the sandbox's own home folder.
- `GET /api/renderers` reports `multiplane doctor --json` (cached for five minutes) together
  with the setting coverage below.

## Commands the app runs

For a shot `shot.html` in the project folder:

```
multiplane inspect shot.html --json
multiplane verify  shot.html --json --no-hosted --fps 30 --job-dir renders/multiplane-jobs
multiplane render  shot.html --json --no-hosted --overwrite --job-dir renders/multiplane-jobs \
  --fps 30 --format webm --quality fast --out renders/preview.webm
multiplane render  shot.html --json --no-hosted --overwrite --job-dir renders/multiplane-jobs \
  --fps 60 --format mp4 --quality standard --out renders/full.mp4 [--audio assets/mix.wav]
```

`inspect` checks that the shot's `#stage` size, `Shot.define` duration and fps match the
project settings. `verify` is Multiplane's determinism check. `render` runs lint first.
With `--json`, every line is one event. The last line is the result:

```json
{
  "schema": "multiplane/1",
  "type": "result",
  "command": "render",
  "ok": true,
  "code": null,
  "data": {
    "frames": 90,
    "fps": 30,
    "width": 1280,
    "height": 720,
    "draft": false,
    "quality": "fast",
    "outputCheck": { "verified": true, "frames": 90, "durationSeconds": 3, "codec": "vp9" }
  }
}
```

Progress lines (`{"type":"progress","phase":"capture","done":30,"total":90}`) appear in the
project's activity. Cancelling a project sends SIGTERM to the process group; Multiplane stops
and exits with code 130. A failed result's `code` and `hint` become the error the repair loop sees.

## Shot format

```html
<link rel="stylesheet" href="/multiplane/runtime/shot.css" />
<style>
  #stage {
    width: 1280px;
    height: 720px;
  }
</style>
<div id="stage">…</div>
<script src="/multiplane/runtime/shot.js"></script>
<script>
  Shot.define({
    duration: 3,
    fps: 30,
    render(t) {
      /* draw from t only */
    },
  });
</script>
```

No wall-clock time, randomness without a seed, CSS animations, timers, `<video>` or `<audio>`
playback, remote files, or state carried between frames.

## Settings coverage

| Setting                                         | Multiplane trial                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Duration (3–300 s, auto)                        | Supported. `Shot.define` duration, checked by `inspect`.                                              |
| Aspect ratio 16:9, 9:16, 1:1                    | Supported, through the fixed `#stage` size.                                                           |
| Resolution 720p preview, 1080p, 2K 1440p        | Supported. The stage size is the output size (`--scale 1`).                                           |
| Frame rate 30 / 60                              | Supported, through `--fps`.                                                                           |
| Preview quality                                 | Partly. `--quality fast` at full preview size. `--draft` halves the capture size, so it is not used.  |
| Full-film quality                               | Supported. `--quality standard`, Multiplane's recommended final setting. `high` is not exposed.       |
| Preview format                                  | Native VP9 WebM, always silent.                                                                       |
| Full-film format                                | MP4 (H.264), as with HyperFrames.                                                                     |
| Audio                                           | Partly. One local file through `--audio`; several sources must be pre-mixed. Pages cannot play audio. |
| Video clips inside scenes                       | Not supported. Frames must be extracted ahead of time.                                                |
| HyperFrames layout and contrast snapshot checks | Not run. Multiplane lint and `verify` run instead.                                                    |

## WebM previews

Every preview video is now a WebM: style catalog previews, project direction previews and
regenerated previews. The motion catalog has no video files; it draws its previews live in
the browser.

- HyperFrames and Remotion still render their checked MP4, which is then converted once to
  opaque VP9 WebM (`-crf 18`, a keyframe every second for seeking, no audio). HyperFrames'
  own `--format webm` always marks the video as transparent, so scenes without a painted
  background would show the page behind the player. Multiplane writes opaque WebM directly.
- Each WebM is checked against its source before it is used: VP9, the same size, frame rate,
  frame count and duration, no audio, a full error-free decode, and SSIM of at least 0.94.
- `npm run previews:webm` lists what would change. `-- --convert` writes verified WebMs next
  to the originals and is safe while the app runs. `-- --switch` then points the style list
  and saved projects at them; projects are only switched while the backend is stopped.
  Re-running skips work already done. Each run writes a report to `.data/migrations/`.
- Original preview MP4s are kept, so old links keep working.

## Full films: MP4 download, 720p viewing copy and card clip

Every finished full film keeps `renders/full.mp4` (the job's `video`) at the requested size and
frame rate. It is the download and is never changed. Once the film is marked ready, the app
makes two lighter copies from it in the shared render queue, so the download never waits:

- `renders/view-720p30.webm` (`viewingVideo`): the whole film as VP9 at 720p and at most 30 fps,
  keeping the shape (1280×720, 720×1280 or 720×720) and never scaling up or raising the frame
  rate. Sound is 128 kb/s Opus, stereo (mono stays mono). Every in-app full-film player uses it.
- `renders/card-3s.webm` (`cardClip`): a silent three-second excerpt at the same size, starting
  half a second into the storyboard scene that covers 30% of the film. Project cards loop it
  muted (paused off screen and with reduced motion) and show a Play film button that opens the
  project.
- `playbackCopies` records `profile` (`view-720p30-opus128-card3s-v1`), `status` (`making`,
  `ready`, `failed`), `error` and `updatedAt`. Until a copy is ready, players use the MP4 and
  cards fall back to the full player.
- Each copy is checked against the master before it is recorded: VP9, expected size and frame
  rate, frame count within one frame, a full error-free decode, SSIM of at least 0.94 against
  the master scaled the same way, and for the viewing copy the video and audio start and end
  within one frame and 25 ms with the same channel count. Files are written to a `.partial` name
  and renamed only after they pass.
- `POST /api/runs/:id/playback-copies` with `{ "jobId": … }` retries or starts the copies. A
  backend restart resumes copies that were still being made; deleting a project stops them.
- `npm run films:copies` lists finished films that need copies. `-- --queue` backs up
  `jobs.sqlite` to `.data/backups/`, asks the running backend to make each film's copies one at a
  time and records the result in `.data/migrations/`. Films with ready copies of the current
  profile are skipped. `-- --remove-unused-heavy-copies` removes the earlier 2K `full.webm` files
  that no project uses once the 720p copies are ready.
- `node --import tsx scripts/verify-playback-copies.ts` renders a six-second 1080p60 Multiplane
  film with stereo sound and makes both copies, without any model call.
