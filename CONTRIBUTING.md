# Contributing to Kiteva

Thanks for looking. Kiteva is a personal project I tinker on in my spare time, so replies may be slow.
Small, focused contributions are the easiest for me to review.

Contributions are licensed under the project’s [MIT license](LICENSE).

## Issues

Open a GitHub issue for:

- **Bugs.** Say what you did, what you expected and what happened. Include your macOS version, Node
  version, provider (Claude or Codex) and whether you use an API key or a signed-in subscription, renderer and, if it's about a film, the requested length and
  settings. Redacted error text from the project's activity line helps a lot.
- **Motion Graphic or motion catalog problems.** The catalog is a personal collection. Some of it is
  great and some of it is probably wrong 😄 If a description, palette or technology suggestion looks
  off, tell me which entry (for example `style-042`) and why, ideally with a source.
- **Ideas.** Describe what you'd like to make and what gets in the way.

Please never paste API keys, `.env.local`, governance prompt text, private project content or other
people's material into an issue.

## Pull requests

1. Open or comment on an issue first for anything bigger than a small fix.
2. Keep one change per PR. Don't bundle unrelated formatting or refactors.
3. Branch from `main`, use clear commit messages, and fill in the PR template.
4. Don't commit generated projects, `.data/`, `user-data/`, model weights, renders or credentials.
5. Leave third-party files alone (see below).

## Set up

You'll need macOS, [Node.js](https://nodejs.org) 24 (see `.tool-versions`), [Chrome](https://www.google.com/chrome/) or [Chromium](https://www.chromium.org), and [FFmpeg](https://ffmpeg.org) with `ffprobe`.

```sh
npm ci
cp .env.example .env.local     # add TYPESAFE_API_KEY (JEV); providers use an API key or your signed-in subscription
npm run build
npm start                      # http://127.0.0.1:4317
```

For UI work, keep the backend running and start `npx vite` in a second terminal
(`http://127.0.0.1:4319`). Local narration is optional: `npm run speech:setup` ([Kokoro](https://github.com/thewh1teagle/kokoro-onnx)) or
`npm run speech:setup:pocket` ([Pocket TTS](https://pypi.org/project/pocket-tts/)).

## Checks before you open a PR

```sh
npm run lint
npm run format:check
npm test
npm run build
```

If you touched browser-facing behaviour, also run `npm run verify:browser` (needs
`npx playwright install chromium` with [Playwright](https://playwright.dev) or `VIDEO_BROWSER_PATH`). The `scripts/verify-generation.ts`,
`verify-continuation.ts` and similar scripts call real models and use real API credit or subscription usage. Only
run them when your change needs it, and say so in the PR.

Add or update tests in `tests/` for behaviour you change. There are already tests for contracts,
workflow checkpoints, governance, renderers, skills and the UI. Follow their style.

## Quality bar for creative changes

Films are judged by watching them, so text-only reasoning isn't enough:

- **Seekability.** Compositions must look identical whether you play through, seek forward, seek
  backward or jump straight to a time. No wall-clock timers, unseeded randomness or idle loops in renders.
- **Renderer contracts.** Respect the selected renderer. Don't swap renderers silently, and record a
  real reason before using the Remotion fallback.
- **Look at real frames.** For changes to prompts, Motion Graphic guidance or previews, include frames
  or a contact sheet from an actual render. If you change a Motion Graphic's prompt or visual guidance,
  rebuild and check its preview in the same PR.
- **Catalog review.** New or changed Motion Graphics need a source and honest limitations. Run the
  technology review script described in [docs/application-guide.md](docs/application-guide.md)
  (`scripts/review-new-style-technologies.ts`) for new styles. A recommended technology isn't
  installed just because it's listed. Say which ones actually ship.
- **Honest copy.** No invented UI, made-up product claims or fake progress in the app or the docs.

## Third-party code and licenses

- [Anatomy](https://github.com/wheresryan22/anatomy) is installed or updated at launch into the Git-ignored `skills/anatomy/` cache. Keep upstream files and its MIT license unchanged. Registration and provider guidance live in `src/server/agents/bundled-skills/`. Test installation, offline fallback, integrity and provider staging when changing that integration.
- Dependencies keep their own licenses. Check the license before adding one. Some existing ones have
  special terms (for example [Remotion](https://www.remotion.dev/license) and
  [GSAP](https://gsap.com/standard-license)).
- Only contribute material you have the right to contribute. Credit any source you adapted.

## Docs

Keep [README.md](README.md) and [README.zh-CN.md](README.zh-CN.md) saying the same thing. If you
change one, change the other, or flag it in the PR so someone else can. Detailed material belongs in
[docs/](docs/).
