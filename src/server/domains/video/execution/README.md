# Video execution

`../workflow.ts` orchestrates planning, capture, execution, validation, rendering and review.
Its execution branches live here:

| Module                      | Responsibility                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `initial-build.ts`          | Start a preview from its shared plan or a full film from its approved plan.                                                       |
| `refinement.ts`             | Apply the refinement brief using the existing model session.                                                                      |
| `question-resume.ts`        | Apply an answered question to the existing composition.                                                                           |
| `implementation-handoff.ts` | Persist the executable prompt and append accepted capture instructions for initial builds and refinements.                        |
| `build-turn.ts`             | Invoke the provider, accept its manifest and storyboard, and recover storyboard validation failures through the shared corrector. |
| `types.ts`                  | Shared execution input and build-turn callback types.                                                                             |

Workspace copying and refinement checkpoints belong to `../refinement-workspace.ts`.
`../refinement.ts` remains a compatibility export for existing callers.

This separation does not introduce new planning calls, sessions, prompts or retry policies.
