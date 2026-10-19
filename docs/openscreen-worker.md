# OpenScreen capture worker

Kiteva's `capture_video` uses [OpenScreen](https://github.com/getopenscreen/openscreen) as its recorder. There is no Puppeteer screencast fallback. Puppeteer controls the application; OpenScreen records its dedicated browser window. FFmpeg converts and validates the recorded media for the selected renderer.

## Local recording (default)

When `KITEVA_CAPTURE_WORKER_URL` is unset or empty, `capture_video` uses OpenScreen on the current machine. No VM is required. The OpenScreen editor remains hidden, but Kiteva opens a dedicated **visible** Chrome/Chromium app window with a fresh profile and records only that window. Screenshot-only preparation remains headless.

OpenScreen is discovered in its standard macOS or Windows installation directory. Set `OPENSCREEN_EXECUTABLE` for another installation path. Full Chrome is discovered from the Puppeteer cache or standard installation paths; set `VIDEO_BROWSER_PATH` to override it. Chrome Headless Shell cannot be recorded by OpenScreen. The recording machine needs the OS recording permissions required by OpenScreen.

Setting a worker URL selects the remote desktop instead. Worker connection or authentication failures do not trigger a local desktop recording. No mode uses a Puppeteer screencast fallback.

## Verification status

OpenScreen v2.1.1's installed CLI and native MCP connection have been verified. Local recording has also been exercised through the actual SDK tools against a sample website: typing, clicking, stopping, silent WebM decoding and native cursor alignment were checked on macOS. Worker transport, process lifecycle and local/remote routing have automated tests. A remote VM recording still requires deployment and verification on the chosen desktop. Do not treat transport tests as proof of a visually correct recording.

## Desktop worker

Use a dedicated macOS or Windows VM with a logged-in graphical desktop. Install Kiteva's dependencies, full Chrome/Chromium, [OpenScreen v2.1.1](https://github.com/getopenscreen/openscreen/releases/tag/v2.1.1) with its CLI, and FFmpeg. Grant Screen Recording on macOS. Keep the desktop session unlocked; prevent sleep. OpenScreen runs without its editor appearing, but its capture source is a real browser window **inside the VM**, on the VM rather than the current machine.

Linux's native OpenScreen recorder requires answering a portal picker on each run, so this deployment does not support unattended Linux workers. A virtual X server alone does not resolve that restriction. See the [OpenScreen CLI requirements](https://getopenscreen.com/docs/cli/#displays-ci-and-servers).

On the worker, configure these environment variables:

| Variable                      | Purpose                                                              |
| ----------------------------- | -------------------------------------------------------------------- |
| `KITEVA_CAPTURE_DESKTOP=1`    | Explicitly enables desktop mode on the isolated worker only          |
| `OPENSCREEN_EXECUTABLE`       | Absolute path to the installed OpenScreen executable                 |
| `VIDEO_BROWSER_PATH`          | Absolute path to **full** Chrome/Chromium, not Chrome Headless Shell |
| `KITEVA_CAPTURE_WORKER_TOKEN` | Shared random secret of at least 32 characters                       |
| `KITEVA_CAPTURE_WORKER_PORT`  | Optional; defaults to 4330                                           |

Start `npm run capture:worker`. The service binds to `127.0.0.1`. It permits one browser session at a time and expires abandoned sessions after 63 minutes (allowing the one-hour native export plus delivery conversion). Session shutdown stops the owned recorder and browser and removes transferred session assets. OpenScreen's original recordings remain in its own recordings directory; configure retention on the worker.

On the Kiteva host, configure:

```dotenv
KITEVA_CAPTURE_WORKER_URL=http://127.0.0.1:4330
KITEVA_CAPTURE_WORKER_TOKEN=<same-shared-secret>
```

Forward that loopback port to the worker over a private tunnel, or terminate HTTPS at an authenticated private reverse proxy. Non-loopback plain HTTP is rejected. Never expose the service publicly. Keep the token out of prompts and source control. Restart Kiteva after changing configuration.

## Website access

The supplied URLs must be reachable **from the worker**. `127.0.0.1` means the worker VM, not the Kiteva host. For a local mock application, forward its port into the VM at the same loopback address/port before starting the session. For example, a private SSH tunnel from the worker can forward a host application's port. Kiteva does not rewrite supplied URLs or silently change allowed origins.

Inspection, screenshots, clicking, filling and recording share one worker browser session. The same origin restrictions and read-only network request filtering apply there. Password fields are prohibited. Use sample data and local demonstrations only. Captures are returned over authenticated HTTP with validated filenames and bounded downloads; worker paths are never interpreted as host paths.

## Verification

Verify the worker's OpenScreen `--help` and `sources --json`, then start a sample website session through Kiteva. Record a short take, interact with the page and stop. Check the returned WebM visually and its cursor overlay alignment before using it in a project. Native window framing can include browser chrome; real worker verification is required for the chosen OS and browser. Do not treat mocked transport/process tests as proof of a visually correct recording.

`capture_video` always exports through OpenScreen's native compositor before returning footage: the moving pointer, click feedback and interaction zooms are already rendered. Every take uses `--auto-zoom`; Kiteva does not inject fallback zoom regions for short takes or early/closing clicks. OpenScreen owns automatic zoom eligibility, timing and focus movement. During text input, the tool measures the complete field and its associated label after scrolling, and supplies a native manual-focus region with a scale that contains that area plus a 24 px margin. This readability region takes precedence over overlapping explicitly requested zooms; native auto-zoom handles the rest of the take. Recorded clicks follow pointer arrival with a brief 450 ms pause. Page checks wait for fonts and visible content, not unconditional network-idle intervals after each action. The capture tool trims idle model/tool-call gaps, preserves real typing/actions and explicit `wait_for_view` holds, and returns cursor timestamps on the edited timeline. The cursor file identifies source-window coordinates before zoom; do not overlay it again. Composition must not stretch or freeze the edited demo to fill an act.

The capture tool fixes only its requested cursor design: blue/cyan/violet Prism Glow artwork, native 3D rendering, hand pointers over buttons/links and the themed arrow over inputs. Cursor size, smoothing, motion blur, click bounce and click impact use OpenScreen's own defaults unless explicitly passed. Kiteva does not encode a replacement native preset. The agent chooses framing per take through `presentation.framing`; omitted framing fields also use native OpenScreen defaults. Every export renders at 60 fps; delivery conversion preserves 60 fps. Existing 30 fps recordings remain readable.

Missing OpenScreen, permissions, an unavailable window, timeout or export failure is an error. The tool records only the dedicated browser window, never the whole desktop, and never switches recording engines.

## Agent-selected presentation

The main model can pass `presentation` when starting `capture_video`, for both local and worker capture. Choose framing explicitly for the project: `padding: 0` for edge-to-edge, or positive padding with `borderRadius`, `shadowIntensity`, `backgroundBlur`, `motionBlurAmount` and `aspectRatio` for an inset presentation. No framing values are supplied by Kiteva when omitted. The cursor design is fixed. Leave cursor size, smoothing, pointer motion blur, click bounce and click impact omitted for native OpenScreen behavior; pass an override only for an explicit project need. Omitted fields are not populated by Kiteva. Automatic zoom and 60 fps are mandatory and cannot be disabled. Custom `zoomRegions` default to `focusMode: "auto"` and follow the cursor; use `focusMode: "manual"` explicitly to hold on a fixed point. They supplement the native auto planner, which avoids these explicit regions. Their times refer to the original recording before idle trimming; focus coordinates refer to the full recorded window. Regions must be ordered, non-overlapping and fit within the take. Depth 1–6 maps to 1.25×, 1.5×, 1.8×, 2.2×, 3.5× and 5×. Choose restrained depths for dense interfaces. Effective settings are returned in `recording.presentation.settings` and saved in the recording inventory.

```json
{
  "action": "start",
  "presentation": {}
}
```

Kiteva writes OpenScreen native schema-version-8 documents so 3D cursor and click-impact settings survive export. The legacy v2 loader drops those fields. Trim and zoom regions remain anchored to the single source clip; the native compositor applies them.
