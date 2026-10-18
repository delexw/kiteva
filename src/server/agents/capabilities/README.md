# Built-in agent capabilities

These are MCP tools registered directly with the Claude Agent SDK and Codex SDK on each turn.
They are separate from authoring skills (`../bundled-skills/`), Motion Graphics and rendering engines.

| Capability        | Registration     | Guidance                | Implementation                                              |
| ----------------- | ---------------- | ----------------------- | ----------------------------------------------------------- |
| React Bits        | `react-bits.ts`  | `react-bits-prompt.ts`  | `react-bits-tools.ts`, launched by `react-bits-server.ts`   |
| Local instruments | `instruments.ts` | `instruments-prompt.ts` | `instruments-tools.ts`, launched by `instruments-server.ts` |

`registry.ts` collects registrations and guidance. Text-only calls receive neither. Planning/review
calls (`readOnly: true`) get `search_components` and `read_component`; build/correction calls also get
`install_component`. The planning server does not register the installation tool, independent of
provider permissions or prompt compliance. No user/global MCP configuration is modified.

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

## Local instrument renderer

`instrument_status` is available during planning and building. `render_instrumental` is registered only
for writable builds with instrument rendering enabled. Video preview generation and correction disable
it even though their visual tools can write files. Both providers receive the same server and tool
list; Codex allows up to ten minutes for a render. Instrument tools use the existing governed model
turn, with no additional composer call. The Music and Narration / lyrics settings remain authoritative.
See [local instrumental music](../../../../docs/instrumental-music.md) for setup, score semantics,
SoundFont licensing and the existing rendering/mixing handoff.
