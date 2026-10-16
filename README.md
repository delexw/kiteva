# Kiteva

A local creative desktop for guided video creation, style exploration, previews,
and full-film generation. Conversations use Ant Design X, with a warm dark theme.

## Run a fresh clone

Requirements: macOS, Node.js 24 or newer, Chrome/Chromium, and `ffmpeg` with
`ffprobe` on your PATH. Local video generation uses the configured Claude or
Codex account. JEV ranking requires a Typesafe API key.

```sh
git clone https://github.com/delexw/kiteva.git
cd kiteva
# With asdf, install the Node version declared in .tool-versions:
# asdf install
npm ci
cp .env.example .env.local
# Configure your provider credentials and TYPESAFE_API_KEY in .env.local.
npm run build
npm start
```

Open http://127.0.0.1:4317. For development, keep the backend running and run
`npx vite` in a second terminal; open http://127.0.0.1:4319.

The app bundles its style and motion catalogs in `assets/catalog`,
with reviewed style artwork,
136 WebM style previews, their authoring sources, and the persistent style brief
cache. Browsing the bundled gallery does not require regenerating these assets
or making model calls. Multiplane is installed by the normal dependency install
and shares the app's Three.js version.

Generated projects, user uploads, room layouts, local databases, credentials,
logs, and temporary review/render workspaces are intentionally excluded. A new
clone starts with an empty personal room. No workspace `outputs` directory is required. The app creates its local data folders
when started; the bundled galleries remain available.

Local speech model weights live in visible, Git-ignored `models/<engine>/`
directories. Kokoro uses `models/kokoro`; Pocket TTS is planned to use
`models/pocket-tts`. Engine implementations share a TypeScript interface under
`src/server/audio/providers`. See [speech setup](docs/speech.md).

Full films retain the original-quality MP4 for downloads. Background copies
provide 720p/30 FPS WebM playback and silent three-second desktop card clips.

## Verify

Run these from the repository root:

```sh
npm run lint
npm test
npm run build
```

Repository-wide formatting and lint configuration lives at the repository root.
See [the app documentation](docs/application-guide.md) and
[Multiplane integration](docs/multiplane-trial.md) for details.
