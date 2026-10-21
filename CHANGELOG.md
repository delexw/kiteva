# Changelog

Notable changes to Kiteva. Versions follow [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-10-18

The first source release of Kiteva: a personal creative workspace that turns ideas and references into Motion Graphic films and interactive pages.

### Added

- **Creative workspace and production workflow.** Create a brief, explore visual directions, review previews, build a full film, and inspect its Storyboard. Claude and Codex providers support configured API keys or signed-in subscriptions. [Initial application](https://github.com/delexw/kiteva/commit/dd83243).
- **138 Motion Graphics and 48 motions.** Browse reviewed examples, combine treatments for a project, and use deterministic, seekable animation. HyperFrames is the default renderer, Multiplane is a trial option, and Remotion is a conditional fallback. [Catalog refresh](https://github.com/delexw/kiteva/commit/571b25a), [latest additions](https://github.com/delexw/kiteva/commit/63cadd4).
- **Shared headless website tools.** Both providers can inspect reference websites and capture silent walkthrough footage into the project workspace. [Website capture](https://github.com/delexw/kiteva/commit/60bec38).
- **Local narration and bilingual delivery.** Kokoro and Pocket TTS offer configurable voices, loudness matching, volume and speaking speed. English and Simplified Chinese video text, narration and lyrics are localized during governed project builds; Mandarin Pocket TTS uses a separate community-model runtime. [Pocket TTS](https://github.com/delexw/kiteva/commit/26187b3), [language support](https://github.com/delexw/kiteva/commit/63cadd4).
- **Provider workspace skills.** Anatomy installs or updates over HTTPS at startup, with verified offline fallback. Both providers use the same staged local skill; upstream files and model weights are not bundled in the release. [Skill installation](https://github.com/delexw/kiteva/commit/63cadd4).
- **Native Windows verification.** An experimental Windows sandbox backend includes filesystem, networking, cancellation and render checks. These checks passed on the Windows CI runner; this does not establish testing on every Windows 10/11 installation. [Native Node capture fix](https://github.com/delexw/kiteva/commit/0d972f1), [successful verification](https://github.com/delexw/kiteva/actions/runs/39096394369).

### Changed

- **Clearer Activity and Governance.** Task-specific activity keeps raw internal content hidden; provider usage is recorded for project cost tracking. [Activity improvements](https://github.com/delexw/kiteva/commit/d02980e).
- **Documented setup and source distribution.** English and Chinese READMEs include an introduction film, desktop and Storyboard screenshots, architecture, technology inventory and cost notes. This is a source release without desktop installers or npm publication. [Documentation](https://github.com/delexw/kiteva/commit/c55e0d6).

### License

Kiteva uses the [MIT License](LICENSE). Third-party components retain their own licenses.

[0.1.0]: https://github.com/delexw/kiteva/releases/tag/v0.1.0
