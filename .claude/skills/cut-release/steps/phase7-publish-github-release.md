# Phase 7 — Verify CI, tag and publish the source release

Read the live workflows. Verify applicable CI for the exact release commit on main, including native Windows checks when triggered. Use bounded foreground observations, report meaningful transitions and do not interpret a queued run or a passing earlier SHA as success.

Recheck that the version tag and release are absent on origin immediately before publication. Create an annotated `vX.Y.Z` tag at the verified main release SHA, then push that tag without force. Verify the remote tag resolves to the intended commit.

There is currently no tag-triggered release workflow. Publish the GitHub source release directly with `gh release create`, the concrete tag, `--verify-tag`, a title and `--notes-file`. Use `--prerelease` for a prerelease version. Do not use `--latest` for a prerelease. Do not upload arbitrary workspace ZIPs, local models, downloaded skills, external demo code, screenshots or test recordings. GitHub supplies source archives from the tag.

If a real release workflow has since been added, follow its actual publication contract and verify its run rather than creating a competing release. Do not invent platform installers or expected assets.

Verify `gh release view` reports the correct tag, URL, publication timestamp, prerelease state and `isDraft: false`. Confirm its body matches the release notes. If publication fails after the tag push, retain the tag and release branch, report that exact partial state, and resume only at the failed step after inspecting current remote state; never retag automatically.
