# Phase 6 — Push the release branch and merge normally

Push the release branch. Create a PR using `.github/PULL_REQUEST_TEMPLATE.md`, with its description saved to a temporary file and passed using `--body-file`. Include scope, version, checks and any actual limitations. Attach the created PR to the task when the client provides the attachment tool.

If resuming an existing PR, inspect its state first; do not update a closed PR. Inspect checks for this exact head SHA, wait for all required checks to pass, and resolve review requirements through normal repository policy. Never use an administrator bypass or merge a failing/pending PR. Local tests do not substitute for Windows CI.

Merge using the repository's allowed method. Fetch and verify that origin/main contains the release change and all three npm version fields match. Record the resulting main commit SHA (a squash merge may change it). A denied merge or push stops the dependent tag/publication steps.

Despite this phase's inherited filename, do not push a tag yet.
