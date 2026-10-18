# Project shape

Re-read the live files before every release; these are pointers rather than fixed version numbers.

| Owner                | Source of truth                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------- |
| Version              | Root `package.json` `.version`                                                              |
| Lockfile version     | `package-lock.json` `.version` and `.packages[""].version`                                  |
| Runtime and commands | `package.json`, `.tool-versions`, `CONTRIBUTING.md`                                         |
| License              | `LICENSE` and both READMEs: a custom MIT-based non-commercial license, not standard MIT     |
| Release notes        | `CHANGELOG.md` when present; dated collapsible updates in `README.md` and `README.zh-CN.md` |
| CI                   | Actual files under `.github/workflows/`, currently `native-windows.yml`                     |
| PR body              | `.github/PULL_REQUEST_TEMPLATE.md`                                                          |
| Scope and exclusions | Repository instructions and `.gitignore`                                                    |

Only the root npm manifest and lockfile own the application version. Do not change dependency versions, third-party manifests, Python package versions, or model revisions to match it. `npm version VERSION --no-git-tag-version --ignore-scripts --allow-same-version` updates the npm version fields without publishing or running release hooks. Check the resulting diff.

There is no tag-triggered release pipeline today. The existing native Windows workflow runs on relevant PR/main changes and has a manual dispatch; inspect its actual triggers rather than assuming that a `v*` tag starts a build. Publish source releases through `gh release create --verify-tag --notes-file` after checks pass. If a release pipeline is added later, read its artifact and publication contract and adapt the publication phase; do not publish twice.

The source repository contains app source, tests, docs, catalogs and reviewed preview assets. Local data, speech environments, weights under `models/`, Anatomy downloads under `skills/`, and external demo files are excluded. Anatomy is installed or updated over HTTPS when the app starts; a source release must not vendor it again.

Supported release claims must match real evidence. Windows is experimental until native CI proves the required boundary and render checks. API keys and signed-in provider subscriptions are configuration choices, not embedded credentials or bundled access.

Get the repository identity using `git remote get-url origin` and `gh repo view --json nameWithOwner,url,defaultBranchRef`. Use the returned URL for commit/release links; never assume a personal fork or default branch.
