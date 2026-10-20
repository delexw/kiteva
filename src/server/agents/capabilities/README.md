# Built-in agent capabilities

These are MCP tools registered directly with the Claude Agent SDK and Codex SDK on each turn.
They are separate from authoring skills (`../bundled-skills/`), Motion Graphics and rendering engines.

| Capability                                                              | Registration                                 | Guidance                             | Implementation                                                                                              |
| ----------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| React Bits                                                              | [capability.ts](react-bits/capability.ts)    | [prompt.ts](react-bits/prompt.ts)    | [tools.ts](react-bits/tools.ts), [server.ts](react-bits/server.ts)                                          |
| Animate UI                                                              | [capability.ts](animate-ui/capability.ts)    | [prompt.ts](animate-ui/prompt.ts)    | [tools.ts](animate-ui/tools.ts), [server.ts](animate-ui/server.ts)                                          |
| Creative Pool                                                           | [capability.ts](creative-pool/capability.ts) | [prompt.ts](creative-pool/prompt.ts) | [tools.ts](creative-pool/tools.ts), [server.ts](creative-pool/server.ts)                                    |
| [Audio Studio MCP](https://github.com/kanaworksai-hue/audio-studio-mcp) | [capability.ts](audio-studio/capability.ts)  | [prompt.ts](audio-studio/prompt.ts)  | [tools.ts](audio-studio/tools.ts), [server.ts](audio-studio/server.ts), [client.ts](audio-studio/client.ts) |

`registry.ts` collects registrations and guidance. Text-only calls receive neither. Planning/review
calls (`readOnly: true`) get `search_components` and `read_component`; build/correction calls also get
`install_component`. The planning server does not register the installation tool, independent of
provider permissions or prompt compliance. No user/global MCP configuration is modified.

## Folder layout

```text
capabilities/
├── registry.ts
├── animate-ui/
│   ├── capability.ts
│   ├── prompt.ts
│   ├── server.ts
│   └── tools.ts
├── react-bits/             # Same registration/prompt/server/tools layout
├── creative-pool/          # Same layout, plus capability-specific types.ts
├── audio-studio/           # Same layout, plus client.ts and types.ts
└── shared/
    ├── types.ts
    └── component-registry-tools.ts
```

Each capability owns its registration, system guidance, server entry point, tools and specific types.
The root registry only collects capabilities. Shared types and the component-registry adapter stay in
`shared/` because multiple capabilities consume them.

## Animate UI and authoring resource selection

`animate_ui` exposes the official [Animate UI registry](https://animate-ui.com/docs/mcp) through the
same controlled registry adapter as React Bits. Planning exposes `search_components` and
`read_component`; building also exposes `install_component`. The tool saves source, declared
dependencies, provenance and the upstream license under `components/animate-ui/` without running
scripts, installing packages or trusting upstream target paths. The official `@animate-ui/react`
package is available locally. Source with other missing dependencies must be adapted or reported;
it must not silently change the renderer or claim installation makes every dependency available.
The upstream MIT + Commons Clause terms apply to imported component source.

Before a new job's model turn, JEV evaluates Animate UI, React Bits, installed bundled skills and
existing local code against the actual brief, chosen Motion Graphics, renderer and available
packages. One native Choice API question selects exactly one primary resource from all alternatives,
without per-resource yes/no thresholds or a fixed weighting scheme. Ordinary local code remains
available to implement the chosen approach. The selected IDs and decisions are saved on the job and supplied as
`authoringResources` in `style-context.json`. This selects authoring resources, not Motion Graphics,
and does not replace the main model's production plan or disable tools. Existing completed renders
resume without a new selection call. JEV failure is recorded as a warning with a limitation; it does
not block generation. Invocation and usage use the same Workflow/Governance event path as other
JEV calls. Both providers receive the decision and renderer-specific usage guidance. Video effects
must be adapted to deterministic composition time; interactive pages retain accessibility and
reduced-motion behavior.

## Creative pool lookup

The internal `creative_pool` server provides `search_pool` and `read_pool_entry` to both SDKs during
planning, building and repairs. It reads the application's current Motion Graphic, motion and
technology catalogs locally. Search returns matching IDs and names; reading returns the full
definition, including sequences, constraints and implementation guidance, in both text and typed
structured content. It writes no files and makes no network requests. Guidance requires reading named
definitions before implementation while preserving explicit user refinements and supplied assets.
Tool availability and instructions do not by themselves prove that the rendered motion is faithful;
the finished composition still needs visual verification.

Both providers receive shared system guidance to use `search_pool` and `read_pool_entry` first for
selected and named Motion Graphics and motions, before planning or implementation. The main model
interprets the full definitions, preserves draft roles and user act assignments, and records their
contributions in the storyboard. These are model instructions, not a host-enforced read gate. There
are no read receipts, style-scope contracts, quote-matching validators or forced style-planning turns.
The normal rendering and final-result review workflow remains responsible for delivered quality;
tool availability and guidance alone do not guarantee model compliance or visual fidelity.

React Bits publishes a [shadcn-compatible registry](https://reactbits.dev/get-started/mcp).
Kiteva's small MCP adapter reads that registry directly over HTTPS rather than launching the general
shadcn CLI. It fixes the upstream origins and rejects redirects, arbitrary URLs and unsafe file paths.
Search returns every matching variant; it has no hidden result cap. Source lookup is cached in memory
for the lifetime of that server. Network failures are tool errors; the model can continue with local
assets instead of treating React Bits as a prerequisite for generation.

Installation saves only the chosen component into a fresh
`components/react-bits/<variant>/<source-hash>-<unique-id>/` directory in the job workspace. It retains
source paths, complete registry JSON, declared npm dependencies, origin, SHA-256 and the upstream
license. Upstream `target` paths are ignored. Existing source is never overwritten, linked destination
directories are rejected, and downloaded scripts are never executed. This tool installs source files,
not npm packages: agents must reuse available dependencies or report missing ones. Additional registry
dependencies need explicit inspection rather than automatic recursive downloads.

The [React Bits license](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md) is MIT with a
Commons Clause restriction, not unrestricted MIT. Keep the downloaded notices with substantial copies;
do not redistribute the component collection. No upstream component code is bundled in Kiteva.

The provider adapters keep their existing event path. Tool events and usage carry the same invocation,
model, session and task attribution into Workflow/Governance. The adapter makes no AI calls and adds no
separate model billing path. Customer Activity shows only curated component-action labels.

## Audio Studio MCP

[Audio Studio MCP](https://github.com/kanaworksai-hue/audio-studio-mcp) is a separate local audio
capability for both SDK providers. It does not replace the renderer or the visual-resource selection.
`audio-studio/capability.ts` registers the workspace adapter, `audio-studio/client.ts` probes upstream MCP
startup/tools, and `audio-studio/tools.ts` forwards the upstream tool schemas and server instructions.
Read-only planning/review and text-only turns receive no audio tools. Build turns expose
`generate_audio`, `edit_audio`, `process_audio` and `unload_models` when installed.

Run the root [install.sh](../../../../install.sh) for app and Audio Studio setup together. For a
standalone setup, use the upstream installer in `.data/audio-studio-mcp`, or set `AUDIO_STUDIO_MCP_COMMAND` to an
absolute executable path from an existing installation. Kiteva automatically detects
`.data/audio-studio-mcp/.venv/bin/audio-studio-mcp` (Windows: `.venv/Scripts/audio-studio-mcp.exe`).
Follow upstream hardware, runtime and model-license requirements. The Apple Silicon installer
supports `--skip-weights` for MCP/post-processing tests; the first generation then downloads model
weights. Installation/downloads are never started automatically by a video job. For Windows NVIDIA
setup use the upstream `install.ps1` instructions. Custom backend settings may use
`AUDIO_STUDIO_BACKEND`, `AUDIO_STUDIO_SA3_DIR`, `AUDIO_STUDIO_SA3_MODEL` and
`AUDIO_STUDIO_IDLE_UNLOAD_MIN`.

The adapter saves output under each job's `audio/audio-studio/`, rejects input files outside that
workspace (including symlink escapes), and retains upstream schemas, descriptions and argument
ranges. Outputs include readable text and discriminated structured content. Native MCP errors are
preserved. Generation/edit calls allow up to 30 minutes; no audio is generated during availability
probing. The agent integrates actual output through the chosen renderer, with narration mixed by
Kiteva's existing speech path. See `../../jev/README.md` for the independent audio Choice strategy.

Visual selection metadata belongs to each capability's `metadata.ts`; the shared registry client is
used by MCP component tools. JEV receives extracted prose about each option’s advantages and limits. React Bits names accept JS/TS-only entries as well
as JS/TS × CSS/Tailwind variants, matching the current official registry. Registry discovery remains
read-only; saving a component still does not install npm or recursively install registry dependencies.
See [JEV visual guidance](../../jev/README.md#visual-choice-guidance) for selection details.
