# Phase 5 — Verify and commit (no tag yet)

Run the repository's required checks from the release checkout:

```sh
npm run format:check
npm run lint
npm test
npm run build
```

Fix relevant failures; do not suppress rules or silently waive unrelated existing failures. For changed UI, rendering, catalog or provider behavior, perform the corresponding real runtime checks from CONTRIBUTING.md. Model canaries use actual credits; run only when the change requires them. Native Windows verification must run on Windows or its CI runner, never be claimed from macOS.

Review intended files, re-scan for secrets and exclude ignored local state. Stage the release-owned manifest, lockfile, changelog and README edits in a separate command. Invoke this release skill only for a release request; that request authorizes staging its own changes, not unrelated ones.

Commit with the project convention (for example `Behavioural: Release vX.Y.Z`), preserving hooks. Do not create the tag until the release commit has passed CI and landed on main through Phase 6.
