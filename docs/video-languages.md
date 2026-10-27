# Video languages

Choose **Video language** in the Assistant's Settings: English or 简体中文. It controls all authored video text, including titles, labels, annotations, captions and credits. It takes precedence over language instructions in the idea prompt. Captured website screens, supplied images, names, code and URLs remain authentic.

In **Narration / subtitles**, Speech language defaults to **Follow video**. An explicit language overrides only spoken delivery. The existing language choices remain available. Voice selection resolves to a compatible voice within the selected engine; Pocket Mandarin uses the separate Chinese checkpoint. Existing requests without a video language retain their prior language behavior.

Changing language only saves the delivery setting. It does not call an AI model, translate editor text or use provider usage. Supplied narration and subtitles stay as entered while editing. When you build a preview or full video, the project's selected Claude or Codex provider translates supplied copy with its small text model. Translation events and usage belong to that project job and appear in Governance under **Video copy translation**. Originals are preserved in the build's localization data; per-source/model/language caching avoids repeat calls for the same build workspace. Generated copy is written in the chosen language. Audio uploads are not automatically dubbed.

Translation alone does not create a video or modify an existing finished film. Create a new version to rebuild layout, font coverage, line breaks, reading holds, voice audio and measured caption timing. The old project and its artifacts remain available. A narration language override can differ from the on-screen language; the renderer must retain the video language for captions rather than copying a differently translated voice transcript.

## Ownership

- `src/shared/video-language.ts`: language schema, delivery voice resolution and localized-copy edits.
- `src/server/jobs/subworkflows/video-localization.ts`: shared text-only localization workflow for both SDK providers, with per-source/model/language cache keys and atomic checkpoints.
- `prepare-subtitles.ts` and `audio/speech.ts`: native-language generated subtitles and narration.
- `domains/video/prompts.ts`: authoritative video text language for every renderer.
- `audio/providers/pocket-tts/chinese.ts`: isolated Mandarin synthesis; see [Speech setup](speech.md#chinese-pocket-tts).

The language preference is saved in the draft; supplied source text remains editable. Original prompt text and dedicated settings remain separate. Generation rechecks localization even when a request comes directly through the API rather than the Assistant. Full-film audio is newly synthesized and timed from the resolved language copy. Previews stay silent.
