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
directories. Kokoro uses `models/kokoro`; Pocket TTS uses
`models/pocket-tts` (`npm run speech:setup:pocket`). Engine implementations share a TypeScript interface under
`src/server/audio/providers`. See [speech setup](docs/speech.md).

Website demo capture is a built-in agent tool for Claude and Codex. Add the
application in Websites and request a walkthrough; the agent records a fresh,
headless browser session and saves validated footage plus cursor metadata in the
job assets. Capture is independent of style choices and needs no desktop recorder.
See [website capture](docs/application-guide.md#built-in-website-capture) for limits
and renderer compatibility.

## Bundled authoring skills and renderers

| Skill                                                    | Use                                                                                                               |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [Anatomy](https://github.com/wheresryan22/anatomy) (MIT) | Detailed isometric technical illustrations and mechanisms; optional rotating, sliding and hinged 3D parts (beta). |

Anatomy's complete upstream skill, drawing kit, references, examples and checks
are bundled in `assets/agent-skills/anatomy`, pinned to revision
`e9488296a44211c42701ff71705b7901470ec78f`. The adjacent manifest records every
bundled file's SHA-256 hash. The upstream files stay unchanged and retain their
license; third-party files are excluded from Kiteva's formatter and linter.
To update the bundle, review a new upstream revision, replace its tracked files
(excluding dotfiles and repository automation), update the manifest and run the
skill and provider tests. Runtime never downloads or updates skills.

Before each file-enabled Claude or Codex turn, Kiteva checks and copies the bundle
to `.agents/skills/anatomy` inside that turn's workspace. Both providers receive
the same explicit reading instructions, including during read-only review;
text-only extraction gets no skill files or instructions. User-global skills,
plugins and SDK settings remain disabled. No provider-specific `Skill(...)`
call is required. Anatomy is selected when suitable or explicitly requested,
and is not required for every 3D scene or linked to individual styles.

| Renderer    | How Anatomy fits                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| HyperFrames | Local SVG/HTML, with part poses and shaders driven by composition time.                                           |
| Remotion    | Local React/SVG components driven by frame time.                                                                  |
| Multiplane  | Adapt generated art to its supported composition contract; validate compatibility before committing to the scene. |

Anatomy does not replace the selected renderer or export pipeline. Its interactive
examples must be adapted for film: disable idle tours and wall-clock loops, use
absolute timeline poses, and check matching frames after direct, forward and
backward seeks. The project's selected palette and visual styles take precedence
over the examples' standalone card designs. Keep the MIT notice with any copied
kit modules. Website recording continues to use Kiteva's built-in `capture_video`.

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
