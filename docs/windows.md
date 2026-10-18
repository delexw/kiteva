# Native Windows 10/11

The native Windows implementation is experimental. It runs directly from PowerShell;
WSL and Docker are not required. Development and regression checks have run on macOS.
Do not treat those checks as proof that Windows rendering or either AI provider works.
Run the native check below on the target Windows machine before generating a project. Windows rendering remains disabled until that machine passes
all checks; project creation is rejected before any model call when the proof is missing. Changes to the runtime, browser configuration or protected provider paths
require the check again.

## Install

Use 64-bit Windows 10/11 and [Node.js 24 or later](https://nodejs.org/en/download).
Install [Git for Windows](https://gitforwindows.org/) and an
[FFmpeg build](https://ffmpeg.org/download.html#build-windows) that provides both
`ffmpeg.exe` and `ffprobe.exe` on PATH. Git's Bash is needed for Claude's coding tools.

In PowerShell, from the repository directory:

```powershell
npm.cmd ci
$cache = Join-Path $env:USERPROFILE '.cache\puppeteer'
npx.cmd --no-install browsers install chrome-headless-shell@stable --path $cache
npm.cmd run caveman:setup
npm.cmd run windows:check
```

The sandbox command can require Windows administrator approval during its first setup.
Do that setup deliberately through `windows:check`; run the normal application as your
normal user. If account/firewall provisioning is denied, fix that setup rather than
turning isolation off. Corporate policies may prevent provisioning.

`windows:check` makes no model calls. It verifies that the renderer can write its
workspace and connect to a local server, while reads of a fake credential, writes
outside the workspace and direct connections to a reachable public endpoint
are blocked. It also cancels a running command and checks that it stops writing. This requires internet access for a baseline TCP connection to `example.com:443`; no HTTP request, credentials or user content is sent. It then runs the actual HyperFrames quality checks, renders a one-second
animation and verifies the resulting media through Kiteva's normal pipeline. Temporary
probe files are removed afterward. Failure means the machine is not ready for native
Windows generation; do not continue on the strength of a build or unit tests alone.

After the check passes:

```powershell
npm.cmd run dev
# In a second PowerShell window:
npx.cmd vite --host 127.0.0.1
```

Open the local URL printed by Vite. Configure your provider using an API key or an
existing native Windows Claude/Codex subscription login as described in the README.
If Claude cannot find Git Bash, set `CLAUDE_CODE_GIT_BASH_PATH` to the installed
`bash.exe` path before starting Kiteva. Provider access is verified by the first brief
turn; the local render check does not test login, subscriptions or model generation.

## How isolation works

Kiteva preserves the macOS `sandbox-exec` backend. On Windows it uses the
[Codex CLI's native sandbox](https://developers.openai.com/codex/windows/), pinned in
`package.json`. This is an operating-system process launcher, not an AI request: a
Claude-authored film uses the same renderer sandbox without making a GPT call or
requiring a GPT subscription. The adapter uses the model-free `command/exec` API so
the normal native executor applies the managed network proxy.

Each invocation passes its own permissions tables to a dedicated local executor.
`.data/runtime/render-sandbox` holds the native sandbox setup state, without model login
credentials. The policy allows workspace, render-home and temporary writes,
blocks credential directories and Kiteva environment files, and requests restricted
network access with localhost permitted. The Windows elevated sandbox is required;
there is no unsandboxed or read-only fallback. Configuration is passed as literal arguments, so concurrent jobs cannot overwrite a shared policy file.
Windows does not support streaming/custom output caps on this execution path. A trusted
child captures complete stdout/stderr into per-command files under render-home; the host
forwards the bytes while the command runs and removes the files afterward. This avoids
truncated quality-check JSON. Provider keys are excluded from the renderer environment.
Cancellation targets the owned process tree by PID, never all Node/Chrome processes.

The Chromium cache can be set with `PUPPETEER_CACHE_DIR`. An explicit
`VIDEO_BROWSER_PATH` or `HYPERFRAMES_BROWSER_PATH` takes precedence. Workspace dependency
links use Windows junctions; isolated Codex auth/session files use copies, so Windows
Developer Mode is not required just to create these links. Both per-user API credentials
and files remain outside generated project workspaces.

## Optional narration

Python and models are optional for silent capture and rendering. For local narration,
install a compatible Python version and then use the existing setup commands:

```powershell
# Set this if python.exe on PATH is not the intended interpreter:
$env:SPEECH_SETUP_PYTHON = 'C:\Python311\python.exe'
npm.cmd run speech:setup
npm.cmd run speech:setup:pocket
```

Managed environments use `Scripts\python.exe`. Model weights stay in the Git-ignored
`models\kokoro` and `models\pocket-tts` folders. Successful environment setup does not
verify every voice/model combination; see [speech setup](speech.md).

## Verification status

The [native Windows workflow](../.github/workflows/native-windows.yml) installs a browser
and FFmpeg, builds the application, tests the platform contracts and runs the real
sandbox/render check without provider secrets. Its runner is Windows Server 2022,
not a consumer Windows 10/11 machine. A passing run still needs consumer-machine checks:
Claude and Codex creation/resume/cancellation, subscription and API login, headless
website capture, Pocket TTS/Kokoro, and any selected Multiplane or Remotion route.
These have not been verified on Windows during this change.
