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

Authoring strategies receive [renderer-owned metadata](../rendering/README.md) through
`rendererMetadataFor`: frame contracts, component/footage restrictions, audio integration and source
handling, generation responsibilities, narration handling and renderer-selection restrictions. Style-combination decisions receive the smaller capability-only view through `rendererDecisionMetadataFor`.
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
statistics, optional motion IDs or generic audio disclaimers. These individual-style summaries are authoring inputs, not JEV ranking payloads. Code validates proposed IDs against the catalog and extracted-summary IDs before any ranking request.

JEV receives the original idea and section instructions unchanged, the condensed brief as supporting
context, compact renderer capabilities and each complete combination brief: style IDs, contributions, rationale/tradeoffs and feasibility notes. Full per-style summaries, definitions, visual cues and catalog pairing recommendations are omitted from both batch evaluation and cross-batch selection. The brief retains content requirements, facts, exact copy, asset descriptions and constraints. Opus reads the full production asset plan and synthesizes relevant coverage, suitability and all applicable limitations into each complete combination rationale’s Asset evidence section. JEV receives that model-authored synthesis, with no separate scene-by-scene asset plan or evidence map. The original idea, section requirements, facts and constraints remain unchanged. Proposal policy revisions invalidate cached proposals and selections that predate this requirement. Proposal feasibility flags and display copy are not ranking inputs. JEV's constraint check
controls rejection; a proposer saying `feasible: false` no longer vetoes the option. Retained options
are marked feasible after that check. Required visual constraints remain authoritative; missing
optional uploads alone are not a blocker.

Batches contain four options, each evaluated with the same absolute Score rubrics plus a Noul
constraint check. After every batch is evaluated, all surviving directions enter a global native
Choice comparison. Candidate criteria retain the complete combination brief without per-style definitions or catalog recommendation text. Renderer decision metadata preserves capabilities and limitations while omitting production CLI/audio instructions. JEV chooses the best remaining direction, sees what was already selected, and
compares the remaining pool again until the requested N directions are selected or the pool is
exhausted. Chosen directions are removed from later rounds. No batch-local top-K pruning is applied.

The Context/Creative weighted scores and bounded preference-history adjustment are preliminary
evidence for these comparisons, not the final order. Returned directions follow JEV's Choice order;
confidence comes from the final Choice. `evaluationConfidence` preserves the preliminary Score certainty separately. `selectionDecision` records the selection round, final compared IDs and their probabilities; subgroup finalist comparisons are not presented as a distribution over every original candidate. Choice certainty measures preference above an even split, not quality or success probability: 0.02 can mean 0.51 versus 0.49 for two options. Usage events retain raw Choice answers and batch Score/Noul answers for inspection. Historical runs without these fields do not have reconstructable original distributions. Invalid decisions, cancellation or service failures propagate
instead of silently returning a numerical-score winner. Each Choice emits its own invocation and
usage events through the shared executor. Random and manually selected styles retain their separate
routes. Proposal and selection checkpoints are versioned so resumed preparation cannot reuse the
old ranking policy.

## Choice context admission

`bounded-choice.ts` checks the exact serialized Choice payload before dispatch against a conservative 32,000 UTF-8 byte ceiling. This is a size safeguard, not an exact token count: the public JEV SDK/API provides usage only after evaluation and exposes no supported pre-dispatch tokenizer. JEV's default limits remain 32K tokens for state plus one question and 64K per request. Long context is not automatically enabled.

Oversized comparisons split before dispatch; each group winner is chosen by JEV, and group winners are compared again. Every candidate enters a comparison; no preliminary-score top-K cutoff is used. Selected directions are removed only after the final model choice. Each comparison includes only its candidates' combination briefs and preliminary evaluations, plus the authoritative idea, section requirements, brief and selection history. Oversized irreducible context fails explicitly rather than silently truncating requirements. A provider `max_tokens_exceeded` rejection also triggers smaller groups where possible; other errors and cancellation propagate.

The proposal prompt asks the authoring model for concise rationales and style roles without repeating catalog or requirement text. Original saved proposals remain reusable; compaction and grouping happen during evaluation without rewriting them.
