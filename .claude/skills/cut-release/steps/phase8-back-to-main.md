# Phase 8 — Verify main and the published tag

Fetch origin. Confirm the tagged release commit is reachable from origin/main, and that the published release points at the same commit and expected version. Check the package and lockfile version fields at that commit, not just in the local working tree.

Return to main only with a clean worktree and fast-forward it from origin. Do not reset, cherry-pick, force-push, or overwrite newer main work. If main advanced after publication, the release SHA may be an ancestor; that is valid and should be reported accurately.

Do not claim the release is complete solely because a tag or draft exists. The actual non-draft GitHub release and relevant CI results are required evidence.
