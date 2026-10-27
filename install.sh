#!/usr/bin/env bash
# One-command macOS setup. Existing credentials and installed applications are preserved.
set -euo pipefail

usage() {
  cat <<'HELP'
Usage: ./install.sh [options]

Install macOS prerequisites, npm dependencies, Chrome for Testing, OpenScreen,
Caveman, local speech providers, Audio Studio MCP/model weights, and build Kiteva.
The default includes large model downloads. Re-running reuses installed runtimes/caches.

  --speech MODE          all (default), kokoro, pocket, pocket-zh, qwen, qwen-base (Apple Silicon), or none
  --skip-audio-studio     Skip local music generation setup
  --audio-no-weights     Install Audio Studio; defer its model weights until first use
  --skip-openscreen       Skip the desktop recorder installation
  --skip-browser          Skip Chrome for Testing and Multiplane Chromium setup
  --skip-caveman          Skip Caveman companion runtime installation
  --skip-build            Skip the app build
  --minimal               Skip speech and Audio Studio
  -h, --help              Show this help

Provider login/API keys and macOS Screen Recording/Accessibility permissions are
user steps. This installer does not start the app or operate your browser.
Native Windows setup: docs/windows.md. Linux is not covered by this installer.
HELP
}

speech=all
audio_studio=1
audio_weights=1
openscreen=1
browser=1
caveman=1
build=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --speech) [[ $# -ge 2 ]] || { echo '--speech needs a mode' >&2; exit 1; }; speech="$2"; shift 2 ;;
    --skip-audio-studio) audio_studio=0; shift ;;
    --audio-no-weights) audio_weights=0; shift ;;
    --skip-openscreen) openscreen=0; shift ;;
    --skip-browser) browser=0; shift ;;
    --skip-caveman) caveman=0; shift ;;
    --skip-build) build=0; shift ;;
    --minimal) speech=none; audio_studio=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done
case "$speech" in all|kokoro|pocket|pocket-zh|qwen|qwen-base|none) ;; *) echo "Invalid speech mode: $speech" >&2; exit 1 ;; esac
[[ "$(uname -s)" == Darwin ]] || { echo 'install.sh supports macOS. For native Windows use docs/windows.md.' >&2; exit 1; }
if [[ ( "$speech" == qwen || "$speech" == qwen-base ) && "$(uname -m)" != arm64 ]]; then
  echo 'Qwen3-TTS requires Apple Silicon.' >&2
  exit 1
fi
if [[ "$(uname -m)" == x86_64 ]] && [[ "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null || true)" == 1 ]]; then
  echo 'Run this installer from a native Apple Silicon terminal, not Rosetta.' >&2
  exit 1
fi

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$project_root"
[[ -f package-lock.json ]] || { echo 'Missing package-lock.json; run from a complete checkout.' >&2; exit 1; }
step() { printf '\n==> %s\n' "$1"; }
node_ready() { command -v node >/dev/null 2>&1 && [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -ge 24 ]]; }

# Homebrew is needed only when a system prerequisite must be installed.
need_brew=0
node_ready || need_brew=1
for executable in npm git ffmpeg ffprobe uv; do
  command -v "$executable" >/dev/null 2>&1 || need_brew=1
done
if [[ "$need_brew" == 1 ]]; then
  step 'Installing missing system prerequisites with Homebrew'
  if ! command -v brew >/dev/null 2>&1; then
    for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
      if [[ -x "$candidate" ]]; then PATH="$(dirname "$candidate"):$PATH"; export PATH; break; fi
    done
  fi
  if ! command -v brew >/dev/null 2>&1; then
    installer_file="$(mktemp -t kiteva-homebrew.XXXXXX)"
    trap 'rm -f "$installer_file"' EXIT
    curl -fsSL --retry 3 https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh -o "$installer_file"
    NONINTERACTIVE=1 /bin/bash "$installer_file"
    rm -f "$installer_file"
    trap - EXIT
    if [[ "$(uname -m)" == arm64 ]]; then export PATH="/opt/homebrew/bin:$PATH"; else export PATH="/usr/local/bin:$PATH"; fi
  fi
  brew_prefix="$(brew --prefix)"
  export PATH="$brew_prefix/bin:$PATH"
  if ! node_ready || ! command -v npm >/dev/null 2>&1; then brew install node; fi
  command -v git >/dev/null 2>&1 || brew install git
  if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then brew install ffmpeg; fi
  command -v uv >/dev/null 2>&1 || brew install uv
fi
node_ready || { echo 'Node.js 24+ is required. Check which node executable your PATH selects.' >&2; exit 1; }
for executable in npm git ffmpeg ffprobe uv; do
  command -v "$executable" >/dev/null 2>&1 || { echo "Required executable unavailable after setup: $executable" >&2; exit 1; }
done

step 'Installing locked app dependencies'
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci
step 'Refreshing Claude Agent SDK to the latest release'
npm update @anthropic-ai/claude-agent-sdk
if [[ ! -f .env.local ]]; then
  cp .env.example .env.local
  echo 'Created .env.local. Add your JEV/provider configuration there.'
else
  echo 'Keeping existing .env.local settings.'
fi

if [[ "$browser" == 1 ]]; then
  step 'Installing isolated Chrome for Testing (not your normal Chrome profile)'
  npx --no-install browsers install chrome@stable --path "${PUPPETEER_CACHE_DIR:-$HOME/.cache/puppeteer}"
  step 'Installing and checking Multiplane Chromium'
  npm run multiplane:setup
fi
if [[ "$openscreen" == 1 ]]; then
  step 'Installing OpenScreen if missing'
  node --import tsx scripts/setup-openscreen.ts
fi
if [[ "$caveman" == 1 ]]; then
  step 'Installing Caveman companion runtimes'
  npm run caveman:setup
fi
if [[ "$speech" != none ]]; then
  step 'Preparing managed Python 3.11 for local narration'
  uv python install 3.11
  export SPEECH_SETUP_PYTHON
  SPEECH_SETUP_PYTHON="$(uv python find 3.11)"
  if [[ "$speech" == all || "$speech" == kokoro || "$speech" == pocket-zh ]]; then npm run speech:setup; fi
  if [[ "$speech" == all || "$speech" == pocket ]]; then npm run speech:setup:pocket; fi
  if [[ "$speech" == all || "$speech" == pocket-zh ]]; then npm run speech:setup:pocket:zh; fi
  if [[ "$speech" == qwen || ( "$speech" == all && "$(uname -m)" == arm64 ) ]]; then npm run speech:setup:qwen; fi
  if [[ "$speech" == qwen-base || ( "$speech" == all && "$(uname -m)" == arm64 ) ]]; then npm run speech:setup:qwen:base; fi
fi
if [[ "$audio_studio" == 1 ]]; then
  if [[ "$(uname -m)" == arm64 ]]; then
    step 'Installing Audio Studio MCP with the official upstream installer'
    audio_directory="$project_root/.data/audio-studio-mcp"
    if [[ ! -d "$audio_directory" ]]; then
      mkdir -p "$project_root/.data"
      git clone --depth 1 https://github.com/kanaworksai-hue/audio-studio-mcp.git "$audio_directory"
    fi
    [[ -f "$audio_directory/install.sh" ]] || { echo 'Audio Studio checkout is incomplete; inspect .data/audio-studio-mcp before retrying.' >&2; exit 1; }
    if [[ "$audio_weights" == 1 ]]; then bash "$audio_directory/install.sh"; else bash "$audio_directory/install.sh" --skip-weights; fi
  else
    echo 'Audio Studio generation requires Apple Silicon on macOS; skipped on this Intel Mac.'
  fi
fi
if [[ "$build" == 1 ]]; then step 'Building Kiteva'; npm run build; fi
step 'Dependency setup finished'
echo 'Next: configure .env.local, sign in to your chosen provider, then run npm start.'
echo 'For demo recording, grant OpenScreen Screen Recording and Accessibility permissions in macOS Settings.'
echo 'Anatomy is installed/updated automatically on the first app launch.'
