# Kiteva — local video agent

A standalone browser workspace for style-led video generation. React/Vite + Fastify, native Claude/Codex SDK streams, Jev style ranking, SQLite jobs, and local HyperFrames exports. OrgKnow is an SDK integration reference only.

## Start

macOS, Node 22.13+, an installed Chrome/Chromium browser, and `ffmpeg`/`ffprobe` are required. Run these commands in this directory:

```sh
npm install
cp .env.example .env.local
# Add TYPESAFE_API_KEY to .env.local; use local Codex/Claude login or API credentials.
npm run build
npm start
```

Open http://127.0.0.1:4317. The app binds only to loopback. The selected provider must have access to the configured exact model. Failed access is reported; models are never silently substituted. Jev credentials remain on the backend. Restart after changing environment settings.

The repository already includes the runtime catalogs, reviewed artwork, WebM style previews and persistent style brief cache. A fresh clone does not need to run the example-generation commands to browse the gallery. Generated projects, personal room state, uploads and credentials stay local and are excluded by Git.

For client development, run the backend plus `npx vite`; Vite proxies `/api` to port 4317. `npm run build` creates the UI served by the backend. `npm run examples -- claude` creates Claude-authored 1280×720 studies for all catalog styles. `npm run examples:videos` asks Claude to read each actual illustration image and annotated SVG, then choose coherent actors and scene-appropriate motion, then renders silent three-second 720p/30 fps H.264 demos. SVG owns the illustration, GSAP owns motion, and HyperFrames owns composition/export. Cards play on hover or keyboard focus, use range-streamed MP4, and show still posters for reduced motion. Both workflows resume from checkpoints; video rendering can run alongside illustration generation. Publication enforces exact palette token colors, validates the full-canvas background, checks rendered colors, and withholds earlier generic demos. Reviewed motion references are optional; selecting none is valid. Neutral wrapper groups preserve original SVG transformations. GPT examples are withheld while Claude replacements are pending. Click a style and **Open style study** for playback. Artwork, motion choices, model, source hash, catalog hash and measured render latency are stored in `assets/style-art` and `assets/style-previews`. These are clearly labeled illustrative vector studies, not photographic assets or physical simulations.

## Workflow

Style information extraction is persisted in `assets/style-summaries`, outside disposable `.data` storage. Preserve this folder during cleanup. Haiku and Luna share source-keyed summaries with original provider/model attribution; changed source metadata still requires a fresh extraction. Temporary extraction inputs belong in `.data/style-summary-workspaces`. The legacy `.data/style-summaries` link supports already-running processes.

Enter a brief and optionally upload documents, images, video, or audio and text/HTML reference URLs (including localhost in local agent mode). Choose context fit or creative interpretation and a single provider. Haiku/Luna prepares the shared brief. Opus/GPT-6.1-sol proposes single styles and combinations from all cached style summaries, without an individual-style shortlist. JEV scores the feasible proposals and selects the requested number of directions. Preview and full generation use the selected main model. Up to five silent 3-second, 720p previews run automatically with five shared generation slots and one render worker. Choose a winner, use the saved project duration, provide feedback, and build a full 1080p video.

Three seconds describes the preview's playback length. SDK generation and validation take longer. The selected video project and provider session continue into the full video. Visuals and motion come from style-appropriate libraries; HyperFrames is composition/export, with Remotion only when a required limitation is documented. No external image, music, or voice-generation services are called. Uploaded audio and code-generated instrumental/effects are supported; unavailable voice or sung-vocal assets must be disclosed.

## Creative room

`/`, `/projects` and `/projects/:id` open a personal desktop. The room arranges itself: the assistant sits bottom-left with the material shelf above it when there is room, project widgets fill the rest in columns, and an opened project (its conversation, directions, full versions and storyboard) takes the space beside the assistant. Windows can be dragged by their title bar (or moved with arrow keys when the title is focused), resized from the corner (or with arrow keys on the corner control), expanded, and minimized to the dock. A window you move or resize keeps your position and size (snapped to a 16 px grid); the others follow the room's arrangement for the current screen. Windows saved before this arrangement existed follow it too, unless their size shows you resized them. **Arrange** puts every window back into the room's arrangement and brings minimized projects back. Below 720 px the room becomes a single column.

An opened project shows its live activity: one line each for project preparation, every preview and every full version, with the latest real step while it works and a recorded total when it is done. Open a line to see each step and the assistant's notes.

**Desktop appearance** (the palette button in the dock, or **Explore → Desktop appearance…**) changes the room's background: the original charcoal, three warm & sweet looks, three cool & sweet looks, or your own PNG, JPG or WebP image (up to 10 MB). A slider softens the background so windows stay easy to read; images can fill the screen or show whole, and can be blurred. Your images are kept in `user-data/room/library` like shelf files but are not added to the shelf or to any project. The choice is saved with the room and shared by every tab.

Styles, motions, technology and governance open from **Explore**.

One assistant handles the fixed brief: idea, documents, images, websites, music and lyrics, settings, then review. Every step after the idea can be skipped, and no model runs until **Create** is pressed. The assistant's conversation list keeps a separate draft for each project being edited, so editing never overwrites a new idea.

The material shelf keeps files at `user-data/room/library` (ignored by Git), independent of any project. Identical uploads are stored once. Project limits — 12 files and 100 MB in total, 8 images, 2 audio files and 3 documents — apply only when files are picked for a brief. Removing a file from the shelf only removes the shelf entry; projects and drafts that use it keep working.

Room layout, drafts, reply drafts, each project's open tab and fine-tune note, and the shelf list live in the `room_state` and `room_library` tables of `.data/jobs.sqlite`, next to projects. Treat that database as user data and keep it during cleanup.

Each tab saves only the windows and drafts it changed (`PATCH /api/room`), so several open tabs never overwrite each other's unrelated work. If two tabs change the same draft or reply, the later one is not overwritten silently: the room shows both choices and keeps this tab's text until you pick. Pending changes are also sent when the page is hidden, closed or left. The dock shows whether the room is saved; if saving fails, the changes stay in the tab and can be retried.

During `npx vite`, the room routes (`/api/room…`) are served by Vite itself from `src/server/room/dev-app.ts` against the same database, so room changes take effect without restarting a backend that is generating. Every other `/api` request is still proxied to port 4317. The production backend registers the same routes.

Questions are labelled with their scope: the project, one preview, or one full version. Optional questions never pause work; the answer is used in the next build. A blocking question pauses only the work it belongs to, at a saved point after a model call has finished, and frees its worker slot. A project question holds back everything that depends on the brief; a preview or full-version question holds back only that build. Missing uploads are never a reason to block. Answering, or choosing the alternative, resumes the paused work once. If that build already has a finished result, the answer is applied in the same model session rather than starting again, and files supplied in an answer go to the builds without redoing the brief. Cancelled work cannot be resumed by an answer. Waiting builds survive a backend restart and resume when answered.

## Data and boundaries

The bundled `assets/catalog/video-style-catalog.json` and `assets/catalog/motion-pattern-catalog.json` are the source of truth. The application does not read workspace output folders. Every style is validated with Zod. New app data, examples, uploads, SQLite events, and editable projects are under `.data/`, which is ignored by Git. The application does not modify OrgKnow.

Native SDK processes run outside the browser, use restricted job workspaces and runtime settings, and receive only selected context. The SDK runtime connects to its provider; generated compositions use local assets. Uploaded/fetched content is treated as data. Reference URL fetching validates DNS and redirects, allows loopback addresses only in local agent mode, and blocks other private addresses. The browser receives videos, metadata, and redacted events, never provider keys. SDK-native sandboxing and Claude tool permission checks constrain execution; this single-user local application is not a hardened multi-tenant code-execution service.

The isolated Codex runtime reuses authentication and model/cloud cache metadata, but not user plugins, hooks, skills, or MCP settings. Its sessions remain under `.data/runtime`. Source ZIPs exclude dependencies, renders, and SDK state. Generated-code exports run inside a macOS sandbox with a separate render home, no provider environment credentials, denied credential/configuration paths, restricted filesystem writes, and local-only network access. Existing browser binaries are reused; set `VIDEO_BROWSER_PATH` when needed. Cancellation aborts the native session and renderer process group. Restart marks unfinished jobs interrupted, except builds waiting for an answer, and retains completed artifacts for explicit retry.

## Checks

```sh
npm run test
npm run lint
npm run format:check
npm run build
# Install the browser once, or set VIDEO_BROWSER_PATH to an existing Chromium:
npx playwright install chromium
npm run verify:browser
# Explicit live SDK verification, consuming provider usage:
node --import tsx scripts/verify-generation.ts codex
node --import tsx scripts/verify-generation.ts claude
```

Live verification fixtures are labeled as SDK tests, not Jev recommendations. Rendering verifies dimensions, duration, frame rate, silence for previews, complete decoding, and a decoded poster. HyperFrames check failures return to the same agent for at most two repairs. The interface exposes reasoning summaries only when supplied by an SDK; it does not invent hidden reasoning or fake percentage progress.

## Output domains

Choose Video or Interactive page when starting a project. Video retains timed previews, duration/aspect controls and MP4 export. Interactive pages preview a working section, support desktop/mobile framing, and expand the approved source into a responsive page with user-driven interactions. Delivery includes a runnable HTML bundle and page plan.

Shared contracts aggregate separate domain models in `src/shared/domains/video.ts` and `page.ts`; content inputs and job state live in shared modules. Generation, prompts and validation live in `src/server/domains/video` and `page`. Page previews use an opaque script-enabled iframe and workspace-scoped resource policy, without access to application APIs. Existing saved video projects remain compatible.

Page validation checks desktop/mobile loading, content, overflow, missing resources and JavaScript errors. This does not establish that every declared interaction has been manually reviewed.

## Server modules

Only `app.ts` (HTTP setup) and `index.ts` (startup) live at the server root. Supporting modules are grouped by responsibility:

| Folder                            | Responsibility                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `catalog/`                        | Style and motion catalogs, examples, summaries, and ranking                      |
| `motion/`                         | Illustration animation, arrow/content sequencing, visibility, and SVG typography |
| `agents/`                         | Provider adapters, SDK session setup, and generation prompt access               |
| `jobs/`                           | Workflow orchestration, queues, and durable job/event storage                    |
| `requests/`                       | Uploaded inputs and reference URL reading                                        |
| `rendering/`                      | Export access and rendering sandbox                                              |
| `runtime/`                        | Application paths, settings, and process execution                               |
| `domains/page/`, `domains/video/` | Output-specific generation, prompts, validation, and rendering                   |

Imports point directly to their owning modules. Scripts and tests use the same folder structure; saved projects and artifact paths are unchanged.

## Agent interface components

The React workspace uses shadcn/ui for selects, buttons, and text areas, and AI Elements for conversation scrolling and streamed messages. Official registry components live in `src/client/components/ui` and `ai-elements`; the reusable `StudioSelect` adapts controlled product values to the framework API. Tailwind utilities are loaded without a global reset so existing Kiteva styling and example artwork retain their appearance.

The conversation consumes the existing provider-neutral event adapter and customer activity filter. It presents messages chronologically, follows new content, and lets users return to the latest activity after scrolling back. No provider calls are routed through an additional UI SDK service.

Website reference tools are exposed to the Claude and Codex Agent SDKs during brief preparation and style combination proposals. The agent uses `reference_browser.inspect_page` to read rendered page content and discover controls/sections, `click_control` to explore relevant existing UI states, and `capture_screenshot` to capture a chosen page or section. This replaces a fixed screenshot before the model runs. Each tool result includes text and structured metadata; capture also returns the PNG image to the model. The browser uses `puppeteer-core` with the same Chrome Headless Shell executable as rendering (`HYPERFRAMES_BROWSER_PATH`, `VIDEO_BROWSER_PATH`, or the existing Puppeteer cache). Captures are saved into brief assets and copied into preview and full-video workspaces. Existing captures and uploaded attachments remain available on retries.

The tools run through an isolated, job-scoped stdio MCP server with a fresh browser session. Navigation stays on supplied website origins, no existing customer login session is inherited, and state-changing HTTP requests are blocked. DNS-pinned connections enforce the URL policy for every redirect and subresource; browser traffic outside that path has no working upstream proxy. Tool calls, capture counts, session time and resource sizes are bounded. Pages and tool results are untrusted source material. The agent must omit unavailable optional steps rather than invent placeholder product screens or require unrequested logos/palette confirmations.

Local agent mode accepts localhost and loopback HTTP(S) reference links on development ports. Set `VIDEO_AGENT_MODE=hosted` to reject localhost references. Other private-network addresses remain blocked in both modes; redirects follow the same policy.

Video workspaces include optional Pica image preparation (`pica` and `vendor/pica.min.js`). Agents can resize uploaded images and screenshots into separate derivatives while keeping originals unchanged. Screenshots should retain readable text and use lossless PNG; image preparation finishes before timeline playback and seeking. Pica is not a rendering or animation library and is unnecessary for vector-only scenes.

### Preparation retries

Retry preparation resumes from persisted, completed checkpoints for reference inputs, brief, optional generated lyrics, all style summaries, combination proposals and direction selection. A checkpoint becomes `completed` only after its full structured result and required screenshot artifacts validate and the result is saved. Running, failed or interrupted steps rerun; their partial SDK responses and browser state are not reused. Failed SDK steps start fresh turns from saved data, not an unfinished session. Completed results are immutable snapshots; lyric copy is not appended again on retries. The project shows explicit completion/retry states after a preparation failure.

Checkpoints survive backend restarts. Missing/corrupt checkpoint data or missing required screenshots invalidate that step and all dependent checkpoints. Changed settings, catalog, model routing or agent mode invalidate the preparation chain. Previously created projects without completion markers need one fresh preparation pass before they can resume from these checkpoints; legacy fields alone are not treated as proof of completion.

Agents receiving website references follow an explicit coverage procedure: identify requested views, inspect the supplied page, navigate relevant existing project/result views, capture distinct required stages, and record attempted navigation for any uncaptured view. A view not yet captured is not treated as unavailable. Optional omissions, recommended upgrades, later generated lyrics and intentionally unselected styles do not become mandatory missing assets. This same policy is supplied to both providers. Preparation checkpoint revision 2 invalidates earlier vague briefs and their dependent results.

Video QA repairs use separate layout, contrast, technical, pacing, and style corrector objects. HyperFrames checks return structured categories, selectors, timestamps, and saved screenshots in `renders/qa-report.json`; advisory findings do not trigger repairs. Each check round fixes its reported issues sequentially, with one model call per issue in the same session, then reruns checks after all issues are addressed. The budget is charged once per round, not per issue. Cheap-eligible rounds allow up to 20 Haiku/Luna rounds before escalation; pacing, style, mixed and unclassified export failures use the selected main model directly. Main-model repairs resume the generation session; cheap repairs share a separately persisted correction session and cannot replace it. GPT-6.1 full videos allow up to five main-model repair rounds, configured in `videoCorrectionPolicy` in `src/server/domains/video/corrector.ts`; other models and previews retain two. Checks stop the loop immediately when the result passes. Corrections must preserve the selected pipeline, dimensions, and duration. Governance records the actual model, correction focus and tier for each invocation. Page generation is unchanged.

Brief preparation supplies Haiku/Luna with Pica inspection copies for oversized uploaded images and screenshot responses. Pica's `mks2013` filter resamples decoded RGBA pixels; oversized images fit within a 2560 px longest edge, retaining their aspect ratio, EXIF orientation, and transparency, and are encoded as PNG without another lossy compression step. Small images are not upscaled or re-encoded. `brief-images.json` maps uploaded inspection copies to unchanged originals; the agent must use the original or a focused capture when small text is unclear. Original uploads and captured screenshots remain the production assets. If optional resizing fails, inspection falls back to the original instead of blocking preparation. Completed brief checkpoints remain reusable.

Brief attachment review inventories every supplied file in `brief-attachments.json`, retaining its original display name and production path. Supported documents get full extracted text alongside the shorter input excerpt. Images use the Pica inspection mapping; local FFmpeg/ffprobe integration provides video sample frames and audio duration/stream metadata using a restricted protocol and format allowlist. These CLIs must be installed in the host runtime; the app does not download them during agent execution. Music/effects can be supplied soundtrack assets without transcripts. Audio metadata does not establish spoken words, lyrics, instruments, or mood; sampled video frames do not verify every event. Inspection failures are recorded honestly without turning present attachments into missing-upload blockers. The model must report a role or inspection limitation for each attachment and treat file contents as evidence, not overriding instructions. The attachment policy revision invalidates older briefs with attachments once; subsequent completed checkpoints remain reusable.

Full videos are capped at 300 seconds (5 minutes), including automatic duration. Direction proposals use the resolved full-video duration to set total distinct style counts: under 30 s, 1–2; 30–59 s, 1–3; 60–179 s, 1–4; 180–300 s, 2–5. One style is primary and up to four are supporting; use the lower end when clarity benefits. Proposal and selected-candidate schemas enforce the permitted range before JEV selection, including checkpoint reuse. The number of directions is independent of styles per direction. Three-second previews demonstrate every selected style in the same representative beat. Existing long-duration settings restore with a 300 s cap while preserving other fields. Interactive page proposals retain their existing 1–3 style range.

Saved style-preview MP4s live in `assets/style-previews/`. Artwork, thumbnails and their manifest live in `assets/style-art/`. Video metadata lives beside the MP4s, and editable HTML/JS compositions live in `assets/style-previews/sources/`. Temporary generation workspaces remain in `.data/examples/` and can be removed after publication. The style gallery serves saved reviewed previews by style/source readiness rather than the whole catalog hash, so changes to optional library or production metadata do not hide existing media or request regeneration. Original generation hashes remain in the manifests as provenance. Preview generation/repair commands use the same MP4 assets folder only when explicitly run.

## Shared technology pool

`src/shared/technology-pool.ts` owns all 90 distinct recommended technologies extracted from the original 115 styles. Catalog entries use `tech.recommended_stack_keys`; `stack_overrides` retains style-specific metadata and `stack_property_order` preserves the original serialized definitions where required. `loadCatalog` resolves these keys for existing API and generation consumers. The original 943 assignments are checked against saved fingerprints, so no APIs, constraints, imports, palette guidance or other metadata are silently dropped.

Before previewing new styles, run `node --import tsx scripts/review-new-style-technologies.ts <style IDs>`. The review receives the complete pool and must assess every key exactly once and cover every requested style. Inconsistent results are corrected in the same session; only a completed validated review is applied. Then generate missing illustrations with `scripts/generate-style-examples.ts claude <style IDs>` and render reviewed native previews with `scripts/repair-style-previews.ts <style IDs>`. Reviewed previews use the selected native renderers instead of forcing all materials into SVG motion. Existing valid artwork and MP4s are reused across unrelated metadata-only changes. Whenever a style prompt or visual guidance changes, rebuilding its preview is part of the same task: update the preview drawing and motion to demonstrate the revised guidance, regenerate its poster and MP4, inspect representative rendered frames and playback, and verify the published preview is ready before reporting completion. A prompt-only edit is not complete; report any rebuild blocker explicitly. This is an editing workflow requirement, not a background watcher that starts model calls on file changes.

## Caveman bundle

The complete official `@caveman-ai/cli` package is pinned to 4.0.1. It is bundled as a local dependency, not a hand-picked or rewritten output skill. All companion binaries are installed by the upstream signed installer under `.data/caveman/bin` (ignored by Git).

```sh
# Install/repair all signed native companions on a fresh checkout:
npm run caveman:setup
# Inspect the bundle:
npm run caveman -- setup --json
# Run an upstream Caveman trial with a supported agent:
npm run caveman -- claude
npm run caveman -- codex
# Inspect locally recorded usage and cost estimates:
npm run caveman:stats
```

The local commands set `CAVEMAN_HOME` to this app's `.data/caveman`. The bundled package retains upstream behavior and licenses. No global installer, copied prompt rules, or custom compression implementation is used.

All application Claude Agent SDK and Codex SDK calls now use the app-local Caveman compression proxy by default, including preparation, previews, full builds, reviews, repairs, regeneration and fine-tuning. The first call starts the bundled proxy on loopback port 4321; both SDKs register the bundled recovery MCP server against the same local store. Existing model selection, structured output and session reuse are preserved. Claude subagent requests inherit this route. JEV ranking uses a separate proprietary API and remains outside Caveman; its usage stays in governance. Codex API-key and ChatGPT subscription logins use their respective upstream routes. No global Claude Code or Codex configuration is changed.

Set `VIDEO_CAVEMAN_ENABLED=false` and restart the idle backend for an uncompressed comparison; `VIDEO_CAVEMAN_PORT` selects a dedicated local port. Enabled calls fail explicitly if the app-local proxy is unavailable instead of silently bypassing measurement. Recovery is the only MCP tool allowed during text-only calls.

Use `npm run caveman:stats` for local metering; logs are in `.data/caveman/sdk-proxy.log`. Caveman can pass through requests that cannot safely shrink. Its savings remain inferred, and subscription traffic is measured in tokens rather than claimed dollar savings. Codex may close its stream after receiving the answer before Caveman finishes observing usage; partial proxy coverage is not zero usage. Keep the SDK-reported application governance totals authoritative and compare equivalent workloads; enabling the proxy does not establish savings.

Upstream: https://github.com/JuliusBrussee/caveman

## Shared video pacing

Both providers receive content-led video pacing guidance in their system instructions. `src/server/domains/video/pacing.ts` owns shared principles for editorial rhythm, action timing/spacing, viewer attention, legible text and audio coordination. There is no universal beat, shot, gesture or transition duration. Favor economical momentum, varied timing and motivated holds; check both dragging and rushing against the content and audience. Generation, planning, pacing repairs and final review use the same principles; text-only tasks retain their analysis-only system prompt. Preserve requested duration and copy. Sources and application-specific interpretation are documented in [video pacing guidance](video-pacing-guidance.md).

## GPT-6.1 preview planning and session reuse

Reusable production lessons are centralized in `src/server/domains/video/model-guidance.ts`. GPT-6.1 video planning, building, previews, fine-tuning and main-model repairs receive the same principles: explicit motion contracts, independent cue-based timing, intentional stillness, readable layouts, continuity, deterministic seeking and evidence-based focused fixes. These rules preserve the assigned stage and selected style; they add no model calls. Other models and non-video tasks are unchanged.

Preview jobs using `gpt-6.1-sol` first run a concise read-only, schema-constrained planning turn. The plan covers the representative preview beat, scene layers, concrete motion values and timing, easing, transitions, reading holds, optional audio, tool responsibilities and acceptance checks. The app validates dimensions, duration, scene coverage and layer references, then writes `VIDEO_BUILD_PLAN.json` and resumes that same SDK session for implementation. The preview is planned, built and repaired in one session. Full generation resumes that selected preview’s latest session without a second planning call.

The validated plan and its model/session checkpoint are saved on the job so a build retry does not spend another planning call. Both turns use the existing governance events and Caveman routing, and planning time contributes to generation time. Missing session metadata or invalid plans stop the handoff. Fine-tuning, already-produced jobs, Claude and other model selections retain their existing paths. Governance labels the preview planning turn separately as `Preview video planning`. Fine-tuning continues the completed full-video session. The model policy lives in `src/server/domains/video/build-plan.ts`; the output schema lives in `src/shared/agents/schemas/video-build-plan.ts`.

Style-information extraction uses one shared, source-keyed cache populated by Haiku and Luna. Both providers reuse valid cached summaries regardless of author. Only cache misses call the requesting provider's lightweight model: Luna for GPT projects, Haiku for Claude projects. Legacy provider caches (including the temporary isolated layout) migrate into the shared cache without generation. Completed preparation checkpoints remain reusable. Governance records the actual author of a cached summary separately from new model calls.

Codex calls through the default Caveman route use the official provider transport settings `request_max_retries = 6` and `stream_max_retries = 8`. With Caveman disabled, the built-in OpenAI provider retains native defaults (4 and 5); the runtime reserves built-in provider IDs and forbids overriding them. The native runtime handles backoff and reconnection; terminal Codex `turn.failed` responses explicitly reporting that the model is at capacity additionally receive up to three app-level retries, after 10, 30 and 60 seconds. Each retry retains the selected model and latest saved session, starts a separately metered SDK invocation and respects cancellation. Other errors are not retried, and models are never switched automatically. Capacity errors still surface after the retry limit. These settings apply only to this app's isolated runtime.

Claude uses the same bounded app-level capacity backoff only after a top-level assistant reports the structured Agent SDK error `overloaded` and the turn fails during execution (or the SDK exits without a result). Native `system/api_retry` overload events, which include the HTTP status and native delay, are shown as progress and do not start another application attempt. A later non-error assistant clears an earlier overload; subagent errors, rate limits, billing/authentication failures and turn/budget limits do not trigger this capacity policy. Retries retain the selected Claude model and latest session, and record separate invocations.

Governance retains raw SDK usage events and computes costs when reading them. The installed Codex exec runtime reports cumulative thread token counters on resumed `turn.completed` events, despite the SDK's per-turn type description. Codex usage is therefore differenced by session before attribution to planning, generation or repair; shared sessions spanning jobs or model changes retain their baseline. New events explicitly carry `usageScope: "session"`; historical Codex events with a known session use the same verified semantics, and explicitly marked `usageScope: "turn"` events are summed directly. Counter decreases are treated as resets; missing fields preserve their prior baseline. Missing session identities are marked as incomplete history and are not combined into a guessed session. Costs price only the incremental uncached input, cache reads/writes and output. Caveman estimates are not deducted again. This recomputes historical reports without rewriting raw events.

JEV preference history is derived locally from retained structured project records, without a summary-model call or separate preference database. A completed preview followed by a full-build job records positive selection intent even if the full build fails; retries and fine-tunes do not create extra votes. The source includes bounded subject/audience/objective, selected style IDs/rationale/preview description, verbatim saved fine-tuning requests, duration/format and creation date. Raw prompts, URLs, files and activity logs are excluded. MiniSearch retrieves related subject/objective records within the same output type, excluding the current project and audience-only overlap. At most four records (two per project, 8,000 serialized characters total) enter the existing JEV evaluation request and its recorded Governance prompt. JEV scores a separate `preferenceFit` dimension under explicit non-instructional guidance; unchosen directions and regeneration are never treated as dislike. Preference fit is capped at 20% in Follow my brief (context mode) or 5% in Explore creative ideas (creative mode), scaled down below three distinct related projects. With no matching history, evaluation and weights are unchanged. Existing hard constraints and feasibility still exclude invalid candidates. User-selected styles continue to skip JEV entirely. Existing completed selection checkpoints are reused; history applies to fresh evaluations.
