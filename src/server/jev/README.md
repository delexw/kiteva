# JEV decisions

| Module                            | Decision                                              | API                                |
| --------------------------------- | ----------------------------------------------------- | ---------------------------------- |
| `strategies/style-combination.ts` | Evaluate combinations, then select across all batches | Score / Noul, then repeated Choice |
| `strategies/visual-authoring.ts`  | Select one primary visual capability or bundled skill | Choice                             |
| `strategies/audio-authoring.ts`   | Select local audio authoring or Audio Studio MCP      | Choice                             |

`client.ts` owns model/version, credentials and SDK configuration. `choice.ts` owns shared Choice execution and invocation/usage events. Each strategy owns its own context and criteria. Visual and audio selections are independent and saved separately in the job and style-context.json.

Audio selection runs only for full video jobs with a Music prompt and no uploaded Music audio. Uploads use their existing source guidance, and silent previews bypass audio selection. The exact Music prompt is passed through unchanged. Empty Music settings add no generation task. Original idea requirements remain authoritative for the main planner.

Before offering Audio Studio to JEV, Kiteva starts the configured local MCP and verifies its tools. This does not load or certify model weights: first generation can still report a model/runtime limitation. An unavailable MCP is excluded from Choice. A failed JEV decision leaves the original request with the main model; it does not waive the requested soundtrack.

## Renderer and tool evidence

All video strategies receive [renderer-owned metadata](../rendering/README.md) through
`rendererMetadataFor`: frame contracts, component/footage restrictions, audio integration and source
handling, generation responsibilities, narration handling and renderer-selection restrictions.
HyperFrames and Multiplane keep their distinct contracts; Remotion is documented as a verified
fallback, not an extra renderer choice. Routing/authoring guidance uses the same audio definitions.

Audio Choice also receives Audio Studio's discovered tool descriptions, JSON argument schemas and
server instructions. Probe success verifies MCP startup/contracts, not model-weight readiness.
The original music prompt and idea remain unchanged; JEV must compare these requirements against
actual capabilities rather than infer functionality from names or equate audio mixing with generation.

## Visual Choice guidance

Each visual option owns its source-grounded distinctions: Animate UI and React Bits in their
capability folders, Anatomy beside its bundled skill, and local authoring in
`agents/local-authoring.ts`. Each option stores its Choice description directly as readable text: what it provides, advantages, disadvantages, implementation costs,
video adaptation, missing capabilities and when to choose it. The comparison text is supplied once,
not duplicated in state. Source references stay in comments beside the option metadata for maintenance.

Visual Choice performs no catalog search or package/skill inventory collection. JEV compares the
written tradeoffs with the complete original idea, image instructions, selected Motion Graphics and
renderer metadata. Catalog size and novelty are not decision rules. Runtime readiness is not implied:
the main model still inspects current source/skills, checks dependencies and license constraints,
and adapts interactive effects to seekable video time. Tools and MCP discovery remain available.

## Style-combination ranking

The proposing model reads the whole style catalog and supplies a textual rationale for each
combination: creative result, each style's contribution, advantages, disadvantages and compatibility
or adaptation costs. It receives the unchanged original idea and section instructions alongside the
brief. Source-extracted `decisionGuidance` adds each style's identity, advantages, disadvantages,
combination fit and visual restrictions, without library inventories, renderer defaults, contrast
statistics, optional motion IDs or generic audio disclaimers. Existing source-matched cached summaries remain reusable through a visual-only ranking fallback;
new extractions include the dedicated prose field without forcing a catalog-wide regeneration.

JEV receives the original idea and section instructions unchanged, the condensed brief as supporting
context, renderer metadata, proposed combination prose and relevant catalog consistency rules and
pitfalls. Proposal feasibility flags and display copy are not ranking inputs. JEV's constraint check
controls rejection; a proposer saying `feasible: false` no longer vetoes the option. Retained options
are marked feasible after that check. Required visual constraints remain authoritative; missing
optional uploads alone are not a blocker.

Batches contain four options, each evaluated with the same absolute Score rubrics plus a Noul
constraint check. After every batch is evaluated, all surviving directions enter a global native
Choice comparison. JEV chooses the best remaining direction, sees what was already selected, and
compares the remaining pool again until the requested N directions are selected or the pool is
exhausted. Chosen directions are removed from later rounds. No batch-local top-K pruning is applied.

The Context/Creative weighted scores and bounded preference-history adjustment are preliminary
evidence for these comparisons, not the final order. Returned directions follow JEV's Choice order;
confidence comes from the final Choice. Invalid decisions, cancellation or service failures propagate
instead of silently returning a numerical-score winner. Each Choice emits its own invocation and
usage events through the shared executor. Random and manually selected styles retain their separate
routes. Proposal and selection checkpoints are versioned so resumed preparation cannot reuse the
old ranking policy.
