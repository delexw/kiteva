# Kiteva

A local creative desktop for guided video creation, style exploration, previews,
and full-film generation. Conversations use Ant Design X, with a warm dark theme.

## Run a fresh clone

Requirements: macOS, Node.js 22.13 or newer, Chrome/Chromium, and `ffmpeg` with
`ffprobe` on your PATH. Local video generation uses the configured Claude or
Codex account. JEV ranking requires a Typesafe API key.

```sh
git clone https://github.com/delexw/kiteva.git
cd kiteva/apps/video-agent
npm ci
cp .env.example .env.local
# Configure your provider credentials and TYPESAFE_API_KEY in .env.local.
npm run build
npm start
```

Open http://127.0.0.1:4317. For development, keep the backend running and run
`npx vite` in a second terminal; open http://127.0.0.1:4319.

The repository includes the style and motion catalogs, reviewed style artwork,
136 WebM style previews, their authoring sources, and the persistent style brief
cache. Browsing the bundled gallery does not require regenerating these assets
or making model calls. Multiplane is installed by the normal dependency install
and shares the app's Three.js version.

Generated projects, user uploads, room layouts, local databases, credentials,
logs, and temporary review/render workspaces are intentionally excluded. A new
clone starts with an empty personal room. The app creates its local data folders
when started; the bundled galleries remain available.

Full films retain the original-quality MP4 for downloads. Background copies
provide 720p/30 FPS WebM playback and silent three-second desktop card clips.

## Verify

Run these from `apps/video-agent`:

```sh
npm run lint
npm test
npm run build
```

Repository-wide formatting and lint configuration lives at the repository root.
See [the app documentation](apps/video-agent/README.md) and
[Multiplane integration](apps/video-agent/docs/multiplane-trial.md) for details.
