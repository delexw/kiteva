# Renderer metadata

Renderer capability facts live next to their renderer names:

- `hyperframes/metadata.ts`: deterministic HTML/timeline authoring and composition audio tracks.
- `multiplane/metadata.ts`: synchronous shots, recorded frame sequences and a pre-mixed soundtrack via `--audio`.
- `multiplane/shots.ts`: validates ordered `production.shots` entries and assembles independently rendered shots. Each HTML shot loads only its own assets; durations are frame-aligned and sum to the full film. The soundtrack is applied once after concatenation, before the existing narration mix. Omit `shots` to keep the single-shot path.
- `remotion/metadata.ts`: frame-driven React authoring/audio and the verified-fallback restriction.

`metadata.ts` owns the common type and shared audio policy. `renderer-metadata.ts` selects the definition without duplicating its facts. Existing render execution remains in `../domains/video/render.ts` and the Multiplane CLI adapter in `multiplane.ts`.

The JEV style-combination, visual-authoring and audio-authoring strategies receive the selected renderer's metadata instead of only its ID. Interactive page jobs keep their separate HTML context. Renderer metadata describes integration, not proof that optional audio generators are installed. Audio Studio tool contracts and argument ranges come from actual MCP discovery, with model readiness explicitly unprobed.

The authoring prompt reads the same audio guidance. Multiplane's CLI adapter also reads its audio flag from that metadata. Keep facts here current when changing renderer behavior, and update the renderer contract/integration tests together.
