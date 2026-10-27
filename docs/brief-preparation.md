# Compact brief preparation

The preparation model returns a small interpretation, not a copy of the request or a production plan. The shared contract is `src/shared/agents/schemas/preparation-brief.ts`.

For an explicitly timed video, required output is:

- `subject`: short title, up to 120 characters.
- `audience`: up to 300 characters.
- `objective`: up to 500 characters.
- `previewBeat`: one narrative action, up to 400 characters.
- `facts`: up to six verified observations, each up to 400 characters.
- `constraints`: up to four genuine assumptions, conflicts or access limitations, each up to 300 characters.

An empty facts or constraints array is valid. Arrays remain native typed arrays; serialized JSON strings are rejected. Genuine capability questions may use the existing optional `assetNeeds` field. Auto duration adds `suggestedDuration` and a short `durationReason`. Pages retain their sections and interaction goals without video timing fields.

Kiteva assembles the existing full brief after validating this response:

- Active provided subtitles and narration text are copied without rewriting into `exactCopy`.
- Verified source inventory and capture paths populate `assetDescriptions`; inventory does not assert uninspected visual content.
- Explicit duration comes directly from the request.
- The original request retains all prompt wording, settings and selected Motion Graphics. Copy embedded in the main prompt remains authoritative there; the model need not reproduce it in preparation.

Detailed evidence stays in the existing source manifests and independent asset review. The main model still owns production planning. Existing persisted full briefs and downstream schemas remain compatible. This redesign adds no outer SDK output retry, JSON-string coercion or model switch. The separate guarded leaf-correction mechanism continues protecting a valid brief during evidence repairs.
