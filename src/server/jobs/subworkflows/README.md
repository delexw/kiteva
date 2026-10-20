# Job subworkflows

`../workflow.ts` selects the route and owns checkpoints and job state. Each subworkflow owns its task's execution.

```text
subworkflows/
├── full-brief/
│   ├── workflow.ts       # Source inspection, interpretation, review and correction
│   ├── preparation.ts    # Full brief prompt and handoff assembly
│   ├── asset-review.ts   # Independent source alignment review
│   └── correction.ts     # Apply and validate focused corrections
├── title-brief/
│   └── workflow.ts       # Text-only project title extraction for direct builds
├── shared/
│   └── brief-title-guidance.ts  # Title instruction used by both brief variants
├── website-reference.ts
├── website-capture.ts
├── result-review.ts
└── video-localization.ts
```

Full brief is used for direction exploration. Title brief is used for direct builds with selected Motion Graphics and returns only `subject`; it does not inspect sources or plan production.

Both brief variants use the existing `brief` checkpoint. Title-only output carries `variant: "title-only"`; full output carries its asset-review revision, so an incompatible cached result is not reused. The complete original request remains available to the main planner and builder in both routes.

Website reference, website capture, result review and localization remain separate subworkflows. MCP tool definitions and server entry points remain in their existing tool modules, outside this folder.
