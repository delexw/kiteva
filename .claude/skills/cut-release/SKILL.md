---
name: cut-release
description: >-
  Cut a versioned release of this project: inspect changes, choose a semantic version, synchronize npm version files, write release notes, verify checks, merge through the repository's normal rules, tag, and publish a GitHub source release. Use for requests such as "cut a release", "release v1.2.3", or "ship a patch release"; ordinary commits and pushes do not invoke this workflow.
---

# Cut a Release — Kiteva

Adapted from the source project's release skill. Keep its inspect → version → notes → verify → publish flow, using this project's actual toolchain and release surface.

An explicit request to cut a release authorizes the release-owned edits, staging, commits, PR, merge, tag and GitHub release described here. Copying, editing or reviewing this skill does not authorize executing a release. Follow user scope, repository instructions and execution permissions. Do not ask again for authorization already given, bypass branch protections, or silently include unrelated work.

## Read first

- [Project shape](references/project-shape.md): version owners, checks, distribution and CI.
- [Version selection](references/conventional-commits.md): conventional commits and this repository's `Behavioural:` / `Structural:` prefixes.
- [Changelog format](references/changelog-template.md): read when writing notes.

## Workflow

Read and execute these phases in order. Keep commands observable and report progress during CI waits; use bounded waits so new user input can be handled. Do not leave detached release commands running.

1. [Inspect and scope](steps/phase1-inspect-and-scope.md)
2. [Create the release branch](steps/phase2-build-release-branch.md)
3. [Synchronize versions](steps/phase3-bump-versions.md)
4. [Write release notes](steps/phase4-changelog.md)
5. [Verify and commit](steps/phase5-verify-commit-tag.md)
6. [Push and merge through normal protection](steps/phase6-push-tag.md)
7. [Verify release CI and publish](steps/phase7-publish-github-release.md)
8. [Verify main and the published tag](steps/phase8-back-to-main.md)
9. [Clean up and report](steps/phase9-cleanup.md)

The inherited phase filenames remain stable; Phase 5 does not tag, and Phase 6 merges before the tag is published in Phase 7.

## Release boundaries

- Ship a GitHub source release. The npm package is private; never run `npm publish`.
- No desktop installers or compiled platform bundles exist in this project. Do not invent assets or claim Windows checks passed from local macOS results.
- Derive repository identity from the current checkout. Never use a copied remote, username, absolute local path or credentials.
- A failed check, duplicate tag, divergent branch, unavailable required CI or denied operation stops the dependent release steps. Preserve work and report the concrete blocker; do not keep pushing or publish anyway.
- Never force-push, reassign/delete an existing remote tag, use `--no-verify`, use an administrator protection bypass, or rewrite the user's unrelated work.
- The separately served demo, model weights, downloaded authoring skills, credentials and temporary test output are not release assets.
