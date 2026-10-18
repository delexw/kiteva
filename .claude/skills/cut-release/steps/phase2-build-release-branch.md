# Phase 2 — Create the release branch

Start from the verified default main branch. Create a branch with the prefix required by the active repository instructions and a `release-vX.Y.Z` suffix. Do not reset an existing branch with that name; inspect whether it belongs to a resumable release or stop with the conflict.

Only release-owned version and documentation changes belong on this branch. Do not merge pending feature branches or include external demo code. Keep a record of the starting SHA so subsequent diffs can be checked against the agreed scope.
