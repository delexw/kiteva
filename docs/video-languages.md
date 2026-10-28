# Video, narration and subtitle languages

**Settings → Video language** selects text authored into the visuals: titles, labels, diagrams and credits. Captured websites and supplied images remain authentic. It does not translate those captures.

In **Narration / subtitles**, each selected language appears in its own voice settings card. Use **Add language** below the cards to add another language, or **Remove language** to remove one. There is no separate multiple-language toggle. Each selected language generates narration and, when the global subtitle switch is on, matching subtitles. Choose a voice once for each language. There is no default-language selector: playback initially uses the first selected language, and viewers can switch tracks in the player. Selecting languages enables narration across the timed script. A global **Show subtitles on screen** switch controls subtitle inclusion. Timed items contain only script source, text and timing. Timed items never display language, voice, narration or subtitle controls. Extra languages add translation and local speech generation time.

The full-film planner receives the track requirements before authoring a shared visual timeline. It creates measured primary narration and records subtitle text in the storyboard without burning it into the picture. Alternate scripts are translated from that narration, synthesized locally and fitted to the same cue windows. Short speech retains natural pauses; an overlong cue is shortened and regenerated once, with playback speed adjustment capped at 1.5×. If it still cannot fit, the build reports the timing failure rather than silently dropping speech or changing the visual timeline.

The renderer saves a shared picture/music master before narration mixing. Each narration language gets an MP4 using the same video frames, a narration WAV and an audio mix. Each subtitle language gets timed SRT and WebVTT files. The primary voice is reused. Music and effects remain shared. Source, cue and translation caches remain inside the project.

## Playback and downloads

Finished full videos expose separate **Narration language** and **Subtitle language** controls. Changing narration switches the matching MP4 while retaining the play position and play/pause state. Subtitle language is selected independently, including Off; native WebVTT tracks provide the text overlay.

**Language downloads** selects the MP4's narration language, narration-only WAV or voice/music mix, and a subtitle language for SRT/VTT downloads. The MP4 variants share the visuals and each contain one language's audio; subtitles are separate files. This does not burn translated captions into an MP4 or translate visual titles during playback. Editable ZIPs include the language files under the source workspace.

For example, choose English Video language, Chinese and English narration, and Chinese and English subtitles. The picture remains English while playback can use Chinese narration with English subtitles, or the reverse.

## Existing projects and activation

Existing requests without `languageTracks` retain their single-language delivery behavior and existing narration overrides. Previously burned-in captions cannot be removed by changing playback controls; build a new version with language tracks to get clean visuals and selectable subtitles. Uploaded recordings are not automatically transcribed or dubbed.

The API accepts a validated `languageTracks` setting and completed jobs expose `languageMedia`. Defaults must reference enabled languages; duplicates and unsupported voice/language combinations are rejected. Narration and visual language remain distinct. Language-track controls require a backend advertising `languageTracksSupported`; an older process running an existing build is not interrupted by a frontend update. Restart it after its work finishes, then reload the settings.

The shared implementation works with Claude and Codex. `src/shared/language-tracks.ts` owns settings and guidance; `src/server/domains/video/language-media.ts` assembles media, reusing the existing localization and speech providers. Cancellation propagates to SDK translation, speech and FFmpeg work. Preview videos remain silent and do not generate alternate audio.

## Module boundaries

See [Language-track architecture](language-tracks-architecture.md) for module ownership, Mermaid diagrams, artifact layout and verification coverage.

- `src/shared/language-tracks.ts`: validated settings, artifact contracts and language policy.
- `src/server/domains/video/language-media/workflow.ts`: build orchestration and manifest publication. Its `translation`, `narration`, `subtitles`, `paths` and `types` modules own those separate responsibilities. The public `language-media.ts` entry keeps callers stable.
- `src/client/components/language-track-settings.tsx`: settings UI, reusing the existing speech profile controls.
- `src/client/use-video-language-tracks.ts`: native player state, subtitle modes and seek restoration; `LanguagePlaybackControls` renders selectors. The generic player does not generate media.
- `src/client/components/language-media-downloads.tsx`: download choices. Playback and downloads share artifact URL resolution in `src/client/lib/language-media.ts`.

The existing localization workflow and speech providers remain the only owners of SDK translation and local synthesis. The renderer only preserves a shared picture/music master; the video workflow requests language media after that render. No provider-specific generation logic lives in React or transport handlers.
