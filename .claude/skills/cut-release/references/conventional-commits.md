# Version selection

Honor an explicit user version or bump. Otherwise inspect all commits after the last ancestral stable `vX.Y.Z` tag, including diffs when subjects are ambiguous. Use the existing `semver` dependency for version parsing and incrementing; do not implement custom semantic-version arithmetic.

| Evidence                                                                                     | Automatic bump                                                                      |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `BREAKING CHANGE:`, a conventional breaking marker, or a verified incompatible public change | Major after 1.0; minor while 0.x                                                    |
| `feat:` / `feat(scope):` or a verified new user-visible capability                           | Minor                                                                               |
| `fix:`, `perf:`, a verified correction or other releasable change                            | Patch                                                                               |
| `Behavioural:`                                                                               | Inspect the diff: feature → minor; fix → patch; incompatible change → breaking rule |
| `Structural:`                                                                                | Patch; describe in notes only when users must adjust something                      |
| Documentation/tests/CI/build-only changes                                                    | Patch if a release was requested; summarize only user-relevant changes              |

Pick the highest applicable tier. Do not silently promote 0.x to 1.0.0. An explicit stable or prerelease version takes precedence if valid and unused; preserve its prerelease status when publishing.

If no ancestral version tag exists, this is the first release: use the current package version unless the user requests another. Its scope is the current main history, not an invented previous version. For subsequent releases use the previous tag as the baseline. If there are no commits since that tag and no explicit new release scope, report that there is nothing new to release.

Record the baseline tag, release commit range, target version and rationale before changing files. Do not default every `Behavioural:` commit to a patch without reading it.
