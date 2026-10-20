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

Verify the worker's OpenScreen `--help` and `sources --json`, then start a sample website session through Kiteva. Record a short take, interact with the page, stop into native review, then edit and export. Check the returned WebM visually and its cursor overlay alignment before using it in a project. Native window framing can include browser chrome; real worker verification is required for the chosen OS and browser. Do not treat mocked transport/process tests as proof of a visually correct recording.

`capture_video` follows the attributed [OpenScreen demo workflow](../src/server/domains/video/route-prompts/openscreen-demo.md): start → interact → stop → review/edit → export → review. Stop returns an editable take and live native MCP operation schemas, not final footage. Use action `edit` with the same recording ID and `native: { operation, arguments }` for native `getFrames`, `getCurrentDocument`, trims, speed regions, zooms, annotations and checkpoints. Omit project IDs and paths: the adapter scopes every operation to the captured take. Source trims and virtual-ruler modifier times are seconds; the native document explains the clock and transition windows. Partial refusals and camera cut warnings are returned for the agent to resolve. Export invokes native automatic zoom and 60 fps rendering, then converts and validates silent WebM. Only exports enter `reference-videos.json`; a repair/re-export replaces that take's entry. The agent can review exported frames using the same native project clock. Native editing works on the recording machine, including over the worker transport.

Kiteva supplies scripted pointer telemetry. Click and fill actions do not scroll or center controls automatically. Offscreen controls must be reached with an explicit scroll_page call; this navigation tool is also available during read-only exploration. It does not calculate input-focus regions or override native zooms automatically; the agent checks field/label visibility in frames and requests native zoom corrections when needed. Clicks follow pointer arrival without a fixed dwell; native OpenScreen controls the rendered cursor smoothing, click effects and zoom animation. The adapter does not choose cuts, remove thinking gaps or remap edit clocks. OpenScreen owns rendering and edit timing. The cursor sidecar remains source-anchored; the exported footage already contains its pointer, click feedback and zooms, so use it directly. Retained source media supports native project review after recording; apply workspace retention to these sources as well as exported media.

The agent selects `presentation.cursorTheme` from `default`, `studio-ink`, `prism-glow`, `pop-coral`, `pixel-candy`, `star-sprout` and `glass-lens` to complement the idea’s primary visual style and palette, keeping the choice consistent across related takes. All new captures disable native 3D cursor rendering. Hand pointers over buttons/links and the themed arrow over inputs remain enabled. Cursor size, smoothing, motion blur, click bounce and click impact use OpenScreen's own defaults unless explicitly passed. Kiteva does not encode a replacement native preset. The agent chooses framing per take through `presentation.framing`; omitted framing fields also use native OpenScreen defaults. Every export renders at 60 fps; delivery conversion preserves 60 fps. Existing 30 fps recordings remain readable.

Missing OpenScreen, permissions, an unavailable window, timeout or export failure is an error. The tool records only the dedicated browser window, never the whole desktop, and never switches recording engines.

## Agent-selected presentation

The main model can pass `presentation` when starting `capture_video`, for both local and worker capture. Choose framing explicitly for the project: `padding: 0` for edge-to-edge, or positive padding with `borderRadius`, `shadowIntensity`, `backgroundBlur`, `motionBlurAmount` and `aspectRatio` for an inset presentation. No framing values are supplied by Kiteva when omitted. Choose `cursorTheme` to suit the idea’s main visual theme and remain legible over the app; omission uses `default`. 3D is disabled and is not an agent parameter. Leave cursor size, smoothing, pointer motion blur, click bounce and click impact omitted for native OpenScreen behavior; pass an override only for an explicit project need. Omitted fields are not populated by Kiteva. Automatic zoom and 60 fps are mandatory and cannot be disabled. Custom `zoomRegions` default to `focusMode: "auto"` and follow the cursor; use `focusMode: "manual"` explicitly to hold on a fixed point. They supplement the native auto planner, which avoids these explicit regions. Their times refer to the original recording before agent-selected native trimming; focus coordinates refer to the full recorded window. Regions must be ordered, non-overlapping and fit within the take. Depth 1–6 maps to 1.25×, 1.5×, 1.8×, 2.2×, 3.5× and 5×. Choose restrained depths for dense interfaces. Effective settings are returned in `recording.presentation.settings` and saved in the recording inventory.

```json
{
  "action": "start",
  "presentation": {}
}
```

The adapter reads the installed OpenScreen MCP schemas instead of maintaining duplicate editing ranges or timing rules. It creates a project from this take, applies presentation through native settings, and binds document operations to that project. It does not expose unrelated projects, arbitrary imports or file paths. Missing required native operations produce an update/error message rather than falling back to another editing engine.
