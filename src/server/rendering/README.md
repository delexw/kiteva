# Renderer metadata

Renderer capability facts live next to their renderer names:

- `hyperframes/metadata.ts`: deterministic HTML/timeline authoring and composition audio tracks.
- `multiplane/metadata.ts`: synchronous shots, recorded frame sequences and a pre-mixed soundtrack via `--audio`.
- `multiplane/shots.ts`: validates ordered `production.shots` entries and assembles independently rendered shots. Each HTML shot loads only its own assets; durations are frame-aligned and sum to the full film. The soundtrack is applied once after concatenation, before the existing narration mix. Omit `shots` to keep the single-shot path.
- `remotion/metadata.ts`: frame-driven React authoring/audio and the verified-fallback restriction.

`metadata.ts` owns the common types and shared audio policy. Each renderer's `metadata.ts` is the single source for its CLI path, common/command flags, preview/full stages, output syntax, quality and format. Change an execution rule there once: `execution.ts` supplies the values to CLI adapters, prompt contracts and saved reproduction commands. For example, Multiplane's `--no-lint` is defined only in `multiplane/metadata.ts` and applies to inspect, verify and render.

Authoring contracts live in `hyperframes/contract.ts` and `multiplane/contract.ts` beside their renderer definitions. `contracts.ts` dispatches them; the video domain re-exports that API for existing callers. Renderer audio guidance remains in the same metadata, shared with JEV and authoring prompts.

`tests/renderer-execution.test.ts` changes one policy flag temporarily and verifies propagation to every Multiplane command, both prompts and reproduction instructions. Keep renderer rules in these owners rather than copying flags or stage decisions into route prompts. `renderer-metadata.ts` selects the definition without duplicating its facts. Existing render execution remains in `../domains/video/render.ts` and the Multiplane CLI adapter in `multiplane.ts`.

The JEV style-combination, visual-authoring and audio-authoring strategies receive the selected renderer's metadata instead of only its ID. Interactive page jobs keep their separate HTML context. Renderer metadata describes integration, not proof that optional audio generators are installed. Audio Studio tool contracts and argument ranges come from actual MCP discovery, with model readiness explicitly unprobed.

The authoring prompt reads the same audio guidance. Multiplane's CLI adapter also reads its audio flag from that metadata. Keep facts here current when changing renderer behavior, and update the renderer contract/integration tests together.

## Progress adapters

Every behavior that varies by renderer belongs beside that renderer; shared layers only dispatch
and consume normalized results. Progress parsing lives in `hyperframes/progress.ts`,
`multiplane/progress.ts` and `remotion/progress.ts`. All implement `RendererProgressAdapter` and
return `RenderProgress` from `src/shared/render-progress.ts`. `progress.ts` dispatches to those
adapters and handles application-owned render start/completion events.

These adapters are pure, browser-safe modules without renderer runtime or Node.js imports. The
client re-exports the dispatcher to interpret saved events, including already running productions.
The activity model, grouping and Ant Design X display do not contain renderer-specific output
formats or phase names. Change a renderer's progress format only in its own adapter.

### Multiplane validated output reuse

The Multiplane provider owns `multiplane/cache.ts`. It stores native successful shot renders with a SHA-256 checksum and atomically publishes cache records. Cache hits restore verified bytes before skipping shot inspection, verification and rendering; final assembly, audio mixing and final-video validation still run. Reuse progress goes through the Multiplane adapter.

Each shot gets its own content key. `multiplane/dependencies.ts` resolves local HTML references, CSS imports/URLs (including fonts and images), and static JavaScript modules with Parse5, PostCSS and Acorn. `multiplane/cache.ts` hashes those dependencies, output settings, the render policy, installed Multiplane/Three sources and the worker environment. A changed shot invalidates that shot; a shared dependency invalidates its consumers. The directory inventory is also hashed, so added/deleted inputs conservatively invalidate all shots. Shot-plan changes invalidate the plan's keys. For segmented renders, the final soundtrack is mixed during assembly and does not invalidate silent shot outputs; single-shot audio is a dependency.

Unresolved or dynamic loading, parse failures, remote resources, unsupported resource formats, symlinked or unreadable inputs disable reuse for that shot. The adapter never trusts a partial dependency graph. `renders/`, `VALIDATION.md`, `.git` and project `node_modules` are excluded from authored inputs; a reference into an excluded directory disables reuse. Installed runtime sources are rehashed before reuse/publication. Cache keys remain limited to the current worker lifetime, avoiding cross-restart assumptions about browser/GPU/encoder state. Other renderers should own their own dependency adapters rather than adding renderer-specific cases to this one.

A source change during rendering prevents cache publication. Missing or corrupt cached output causes a normal render. Failed renders do not publish cache entries. Run `node --import tsx scripts/verify-multiplane-reuse.ts` for an isolated real-render case covering identical decoded frames on reuse, rebuilding only one edited shot, invalidating both consumers of shared CSS, inherited fine-tune caches, and recovery from corrupted cache bytes. It leaves its temporary output and a JSON report for inspection.

### Explicit visual update stages

[`src/shared/visual-stage.ts`](../../shared/visual-stage.ts) is a browser-safe, renderer-independent, opt-in helper for authored shots. Each renderer supplies its own `calculate(time)` and `apply(state, changedKeys)` callbacks; the shared lifecycle owns only state validation, exact change detection, successful-state commit and invalidation. Renderer-specific drawing, timing and input preparation stay with the renderer. It separates calculation, decision, application and commit. Each instance exclusively owns one output surface: for example a footage canvas or a caption DOM subtree. Calculate a complete scalar state from absolute time on every call; compare it exactly against the last successfully applied state. Any changed value, added/removed key or changed `inputRevision` rebuilds the entire owned part. `changedKeys` is diagnostic, not permission to leave other properties untouched. After an apply failure, the remembered state is discarded. Call `invalidate()` after external changes, resizing or context restoration.

Reuse defaults to **off**. Enable it only when every input affecting the part is represented. `inputRevision` must identify the complete immutable source/asset/font/configuration input set; actual changed bytes must produce a changed revision, even at the same filename. A manually maintained revision label alone does not establish dependency completeness. If any dependency is unknown, leave reuse disabled and redraw. Continuous motion values must remain in the calculated state; never compare only time buckets. Shared canvases must use one combined owner or separate layers.

This helper does not discover omitted dependencies or calculate their hashes automatically, and it is not injected into existing/generated projects. It is an explicit authoring building block; production adoption requires a complete input preparation step. The conservative project-wide render cache remains independent. `tests/fixtures/multiplane/visual-stage.html` demonstrates two independent stages, with a fixed input revision only because the fixture has immutable hardcoded inputs. The browser test compares screenshot bytes after forward, backward and fresh direct seeks.

### Fine-tune handoff

Fine-tune forks the completed full video's source/assets into a new workspace and resumes its existing model session. Renderer metadata owns the cache directories eligible for inheritance; Multiplane declares its validated shot cache. Shared orchestration copies only those directories, skipping symlinks. Prior final exports and QA reports are not published as the new result. Missing or unreadable caches fall back to normal rendering.

The saved job and `renders/refinement-checkpoint.json` record the source job/session, source and destination workspaces, requested changes, completed source phase, actual file availability and SHA-256 hashes for the previous output, manifest and storyboard, and inherited cache directories. The resumed model receives only the current/previous workspaces and previous-file availability. Hashes, session IDs, cache paths and validation/orchestration details stay in application state. The model inspects only sources relevant to the edit and writes in the new workspace; authoring selections carry forward too. The application still owns rendering, assembly, audio mixing and final validation.

Cache inheritance does not promise incremental rendering. Multiplane still validates the complete project-input hash, current worker/runtime identity, output settings and cached bytes. Any source, asset, soundtrack, settings or orchestration-input change conservatively invalidates the cache; restarting also invalidates reuse. There is no inferred audio-only bypass. Run `scripts/verify-multiplane-reuse.ts` to check that an unchanged fork actually reuses native renders with identical decoded frames, while changed inputs and corrupt cache bytes render again.
