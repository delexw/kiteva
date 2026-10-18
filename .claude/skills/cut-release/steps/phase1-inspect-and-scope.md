# Phase 1 — Inspect and scope

1. Read applicable repository instructions, the PR template and the project-shape reference.
2. Scan staged, unstaged and intended new release content for secrets before staging anything. Report real findings without exposing their values.
3. Inspect `git status --short`. If unrelated changes are present, preserve them and stop this release rather than stash, reset or quietly ship them. The skill's own changes from a resumed release are not unrelated: verify their provenance and exact version before resuming.
4. Read origin and GitHub repository identity. Fetch origin and tags. Require main to be current with its remote and reject divergence; do not force-sync.
5. Find the last ancestral stable version tag. With none, follow the first-release rule. Inspect the intended commit range and apply the version-selection reference.
6. Check the proposed version tag locally and remotely, and check `gh release view` for that version. Distinguish a confirmed absent tag/release from a network or authentication failure. Existing versions are not overwritten.

Report the target version and scope. Create no tag, branch or release until these checks pass. Do not treat a request to create this skill as a request to execute it.
