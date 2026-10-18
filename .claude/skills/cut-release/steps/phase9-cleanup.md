# Phase 9 — Clean up and report

Delete the local release branch with `git branch -d` only after verifying its commit is preserved by main and the release tag. If normal deletion refuses, retain the branch and explain why; do not use `-D` just to tidy up. Remote branch cleanup follows the PR merge operation and repository rules; do not delete unrelated branches.

Report the version/tag, published release URL, included commit count, release commit, CI conclusion and source-only distribution. Mention any retained branch or remaining blocker. Do not describe optional or experimental platform support as verified without its native result. Failed publication is a partial release, not success.
