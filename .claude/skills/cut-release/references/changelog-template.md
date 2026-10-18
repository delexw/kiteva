# Changelog and README updates

Create `CHANGELOG.md` only during an actual release when it does not yet exist. Start with `# Changelog` and explain that versions follow semantic versioning. Preserve existing release entries.

Use a section `## [X.Y.Z] — YYYY-MM-DD` followed by a short statement of the visible changes. Use only applicable Added, Fixed, Changed, Removed and Breaking changes groups. Link substantive bullets to verified commits or PRs using the repository URL derived from GitHub. Credit contributors only from verified authorship; do not guess handles from email addresses.

Read commit diffs. Omit routine formatting and internal-only churn, but include relevant setup, compatibility, license or security changes. Do not reuse another project's feature names or claims about installer artifacts.

Update Recent updates in both READMEs with matching facts and native wording. Dates use `Pacific/Auckland`. Each date has its own closed-by-default `<details>` block with the date in `<summary>`. Reuse an existing date rather than creating duplicates. No additional outer history toggle is needed. Changes pushed or intended for main are released updates; do not label them Unreleased. Never hide known failed or pending Windows verification.

End the changelog with a version reference pointing to the derived repository's `/releases/tag/vX.Y.Z` URL. Write the exact release section to a temporary notes file for GitHub, retaining real newlines. Use structured arguments or `--notes-file` / `--body-file`; never interpolate a Markdown body into a shell command.
