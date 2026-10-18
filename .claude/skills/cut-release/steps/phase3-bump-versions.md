# Phase 3 — Synchronize versions

Run the native npm version operation for the selected version:

```sh
npm version VERSION --no-git-tag-version --ignore-scripts --allow-same-version
```

Replace VERSION with the validated concrete version using safe argument passing. Verify `package.json.version`, `package-lock.json.version` and `package-lock.json.packages[""].version` all match. Preserve `private: true`, the existing license declaration and dependency specifications. No Rust or installer version files exist here.

Inspect the lockfile diff. Never commit dependency downgrades or broad lockfile churn caused by an older npm installation. Resolve the toolchain mismatch before continuing.
