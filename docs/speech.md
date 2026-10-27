# Speech and vocals

The Assistant has separate **Music** and **Narration / subtitles** steps. Choose local narration, an attached spoken/sung recording, and optional on-screen subtitles. Narration with a separate script works with subtitles off; “Speak the displayed subtitles” specifically depends on subtitles. Existing voice-off projects stay voice-off.

Choose **Video language → English / 简体中文** in Settings. Narration follows it by default; the Speech language selector allows an explicit override. Changing language saves the setting without a model call. Supplied scripts and subtitles are translated during project building through the selected AI provider, with usage recorded against the project in Governance. Generated scripts use the chosen language even if the idea is written in another language. See [Video languages](video-languages.md).

Local narration offers Kokoro, Pocket TTS or Qwen3-TTS through app-owned provider adapters. Pocket TTS keeps all 27 official presets across seven languages and adds eight Mandarin reference voices through [PocketTTS-ZH-6L](https://huggingface.co/hustfyb/PocketTTS-ZH-6L). The Chinese voices are explicitly synthetic Kokoro references, not official Pocket presets or clones of supplied human recordings. English uses the existing Pocket checkpoint; Chinese uses the separate Mandarin checkpoint. No fallback to another engine is silent. TTS does not generate singing. Upload a voice-only recording under Music for recorded vocals. Changing a language does not translate an uploaded audio recording.

## Local setup

Requires Node 24, FFmpeg and Python 3.10–3.13. Run:

```sh
npm install
npm run speech:setup
```

Setup installs Python requirements in ignored `.data/speech-venv`, copies the existing HyperFrames Kokoro cache when available, or downloads the Kokoro model/voices when absent, and synthesizes `.data/speech-setup.wav`. It does not change system Python. The model and voices live in visible `models/kokoro/` folders, outside `.data`, and are ignored by Git. The previous `~/.cache/hyperframes/tts` files are preserved. A fresh clone needs setup; these runtime files are not repository assets.

`SPEECH_SETUP_PYTHON` selects the interpreter used to create the environment. Kiteva uses the managed environment automatically when present. `HYPERFRAMES_PYTHON` can override it with another Python environment containing the same requirements. `/api/speech/status` checks dependencies and model files twice before reporting unavailable. No synthesis job downloads models or installs packages automatically.

## Provider ownership

Each speech engine owns a separate TypeScript implementation under `src/server/audio/providers`, sharing the `SpeechProvider` interface. `kokoro/index.ts` owns interpreter selection, readiness and synthesis; `speech.ts` coordinates scripts, timing, caching and mixing. Renderers do not load speech models.

Pocket TTS has its own `pocket-tts/index.ts` adapter, visible Git-ignored `models/pocket-tts/` directory, and isolated `.data/pocket-tts-venv` Python environment. Install its pinned package (3.3.0), all seven models and 27 preset voice embeddings with:

```sh
npm run speech:setup:pocket
```

Setup downloads all seven official language models, exports all 27 voice states for every language and writes a local-only config plus a readiness manifest per language under `models/pocket-tts/languages/<language>/`. The shared catalog in `src/shared/pocket-tts-catalog.json` supplies both the UI and Python adapter; there is no separate preset subset. To install one language explicitly, use `npm run speech:setup:pocket -- --language italian`. It then synthesizes `.data/pocket-tts-setup.wav`. `POCKET_TTS_PYTHON` can select another environment containing the pinned package. Synthesis loads only local model paths with Hugging Face offline mode enabled; model downloads happen only during explicit setup. A fresh clone needs setup once per engine. Python environments, model weights and voice data remain Git-ignored runtime files.

The Narration / subtitles step keeps script, speed and writing direction when you switch engines, and selects a valid default voice for the new engine. The seven official Pocket languages retain all 27 official voice choices; Mandarin shows all eight compatible synthetic reference voices. `/api/speech/status?engine=pocket-tts&voice=pocket_giovanni` checks the selected language model and retries before reporting unavailable. Listen and generation use the selected engine; neither silently falls back to another model. Pocket speed changes use FFmpeg's pitch-preserving `atempo`, and both providers validate audio before publishing and remove partial files on failure or cancellation. Speech is separate from website capture and from the selected renderer.

## Chinese Pocket TTS

`./install.sh` initializes all speech engines by default, including Chinese Pocket TTS.
Use `./install.sh --speech pocket-zh --skip-audio-studio` to prepare only Kokoro and
Chinese Pocket TTS. Web startup only checks readiness; it never installs packages or
downloads models. If a Python upgrade removes the interpreter used by the managed
Chinese environment, rerunning setup recreates that broken environment while retaining
the existing model files and voice references. Manual setup is also available:

```sh
npm run speech:setup
npm run speech:setup:pocket:zh
```

The second command installs an isolated `.data/pocket-tts-zh-venv` (Pocket TTS 3.0.2 and PyTorch below 2.10, matching the published int8 format), downloads the pinned community checkpoint and inference files to Git-ignored `models/pocket-tts-zh/`, and generates eight explicitly synthetic Mandarin references using Kokoro. Kokoro uses its native Misaki Chinese frontend, not the English phonemizer. The Chinese model adapter is `src/server/audio/providers/pocket-tts/chinese.ts`; the existing Pocket adapter routes Mandarin requests to it. Runtime inference is offline. `POCKET_TTS_ZH_PYTHON` overrides only this isolated runtime.

| Female   | Male    |
| -------- | ------- |
| Xiaobei  | Yunjian |
| Xiaoni   | Yunxi   |
| Xiaoxiao | Yunyang |
| Xiaoyi   |         |
| Yunxia   |         |

Grouping starts from the gender metadata in the [Kokoro voice list](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md). Yunxia is grouped Female because both local classifiers rated its actual PocketTTS-ZH output female-sounding despite the source being listed Male; the other seven agreed with their source groups. These automated acoustic estimates are not identity claims. The community checkpoint is reference-based and ships no named preset voice pack. Listen and finished narration both synthesize through PocketTTS-ZH with the selected reference. Existing Xiaobei selections stay valid. Each reference is stored separately under `models/pocket-tts-zh/voices/`; weights and references remain Git-ignored. Setup adds missing references without replacing existing recordings.

The pinned revision is `dbd96b917b7f85443abf249d456db0ffce0d638d`. Upstream provides normalization, punctuation handling, token-length splitting and silent-output retries. Mandarin supports common English terms, not pure English sentences, dialects or singing. Do not reuse English Pocket voice embeddings with this checkpoint. Source and weights retain the [upstream Apache-2.0 license](https://huggingface.co/hustfyb/PocketTTS-ZH-6L). Windows installation and synthesis still require native Windows verification.

## Pipeline

Pocket's dropdown uses native Ant Design Select groups: Female and Male. All 27
presets appear exactly once; option names have no gender suffix. The shared
catalog records the group and exact upstream reference URI for every preset.
Alba is in Male after checking its actual reference and generated samples.
See the [complete voice audit](pocket-tts-voice-audit.md) for all 27 results,
source checks, classifier revisions and limitations. Grouping changes no
recordings, voice IDs, language support, synthesis parameters or saved selections.

Previews remain silent and never generate voice. For full films Kiteva prepares voice before visual implementation, using the existing small text-model route only when a separate script is requested. It synthesizes each supplied line, measures the actual WAV duration, and supplies line-level timing to the visual builder. These are not word timestamps or forced alignment. Uploaded recordings have no inferred caption timings.

Scripts and completed speech tracks are checkpointed in the job's audio folder. Changing the script, voice, speed or relevant brief invalidates the cache; unchanged visual repairs reuse the track. Cancellation does not publish an incomplete track. Audio longer than the requested film is rejected with a specific customer message, never cut silently.

The composition produces background music/effects only. After HyperFrames, Multiplane or the existing Remotion fallback renders, Kiteva mixes the prepared voice into the master with FFmpeg, ducks the original soundtrack beneath it, limits peaks and validates the resulting export. Video frames are copied during mixing. Viewing WebM copies retain the master audio; desktop clips remain silent. The renderer does not synthesize speech.

An unavailable runtime, overlong recording or failed mix is reported as a speech error. App-owned mixing failures are not sent to a visual corrector. Existing generation transport, provider credentials and renderer choice are unchanged.

## Feature verification

Run type checks, lint and tests, including `speech-settings`, `speech-audio`, `speech-routes` and `speech-ui`. Browser verification should cover Subtitles off/on, voice choices, Listen, script edits, saved drafts, uploaded recordings and review. Test rendering and decoding with both renderer choices. Real model installation/synthesis is an explicit setup/smoke step rather than a dependency of every test run.

### Narration volume

Kokoro and Pocket TTS narration is automatically matched to a common perceived level before applying the Narration volume setting (0–200%, default 100%). Listen samples and project narration use the same processing. Peak limiting protects against clipping; high volume may compress peaks. The final mix also limits combined music and voice peaks. Uploaded recordings are unchanged. Existing projects default to 100%; older cached narration is regenerated when next requested.

## Timed script items

The Assistant supports an ordered list of script items. Each has absolute start/end seconds, text, an independent on-screen subtitles switch, and speech off or narration with its own engine, language, voice, volume and speed. The existing voice controls are reused. Add, remove and reorder items; reordering does not change their explicit times. Existing shared-script drafts retain their editor until **Use timed script items** is selected. Uploaded recordings remain available in the existing editor.

`request.scriptItems` is authoritative whenever present, including an empty list. Legacy `speech` and `subtitles` values are then ignored. Item text is supplied verbatim, independently of the global output language. Narration voice/language compatibility, unique IDs, valid windows, non-overlapping spoken windows and the film boundary are validated. Auto duration accommodates the last item. The app synthesizes each spoken item separately, refuses overlong audio instead of truncating it, shifts measured cues into film time, and combines the voices once for renderer-independent mixing. Subtitle-only items require no speech engine. Model instructions enumerate each item with explicit timing, text visibility and speech controls; previews remain silent.

Workers advertise `scriptItemsSupported` in `/api/setup`; the client blocks generation against an older worker instead of silently dropping items. Restart the backend after upgrading. Existing projects and scripts are not automatically rewritten into multiple items.

Each timed item can use **My script** or **Write a script**. In the latter, its text field contains writing instructions, never caption copy. For full films the main model plans first; a text-only generation step resolves each requested script from that plan, the brief and its window/language. The resolved text feeds both TTS and captions. Fixed items stay unchanged, and cached generated text is reused only while its plan and writing inputs match. Demo items can therefore keep one chosen voice while their wording follows the planned demonstration. Generated scripts also require an updated worker (`generatedScriptItemsSupported`).

Pocket TTS's non-Mandarin runtime keeps one language model warm and caches each selected voice state in that process. Native `copy_state=True` isolates utterances from cached voice state. Requests are serialized; changing the language/runtime/setup replaces the worker. Cancellation, timeout or worker failure discards it so the next request starts cleanly. The worker closes after five idle minutes or server shutdown; a new process still needs one model load. Completed item audio is cached independently, so editing one item does not invalidate other items' audio.

## Qwen3-TTS on Apple Silicon

Choose **Qwen3-TTS** under Speech engine, then a Female or Male voice profile. The provider uses **Qwen3-TTS-12Hz-1.7B-VoiceDesign**, via the community MLX BF16 conversion pinned to revision `7d3824abff87e49756bb0f83fb5411de75d160c4`, with MLX Audio 0.6.2. It runs locally on Apple Silicon; no hosted TTS service or Fish dependency is used.

| Female              | Male                |
| ------------------- | ------------------- |
| Bright              | Clear               |
| Warm                | Deep                |
| Broadcast narrator  | Broadcast narrator  |
| Technical explainer | Technical explainer |
| Playful             |                     |

Broadcast narrator profiles use clear diction, stable breath and restrained broadcast delivery, with standard Putonghua for Chinese narration. Technical explainer profiles emphasize patient, structured explanation and clear terminology. Bright suits product introductions, Warm suits approachable storytelling, Clear suits friendly tutorials, and Deep suits documentary narration.

Playful uses a youthful, sweet adult female voice with gentle teasing warmth and light upward inflection, while keeping narration and technical terms clear.

Profiles describe voice characteristics and delivery; they are not fixed speaker recordings or official CustomVoice presets. Both Chinese and English work with every profile. Changing narration language, or following video language, preserves the selected profile. Mixed-language technical terms remain authored text, with pronunciation requiring listening review.

```sh
npm run speech:setup:qwen
```

`./install.sh --speech qwen --skip-audio-studio` prepares only Qwen speech; the default `all` also includes Qwen on Apple Silicon. Setup owns the model download (roughly 4.5 GB), isolated `.data/qwen3-tts-venv`, and readiness manifest. Reruns reuse downloads. It does not require Kokoro voice references. `SPEECH_SETUP_PYTHON` chooses the setup interpreter; `QWEN_TTS_PYTHON` overrides only the Qwen runtime. Web startup and narration never install packages or download weights. Models remain Git-ignored under `models/qwen3-tts/`.

The TypeScript adapter, Python implementation and requirements live in `src/server/audio/providers/qwen3-tts/`. UI and runtime share the profile catalog `src/shared/qwen-tts-catalog.json`. Voice descriptions are independent of model installation: adding or editing profiles does not invalidate the checkpoint manifest or require another model download. The same manifest/runtime check serves readiness and synthesis, retries failures, and retains actual diagnostics. Synthesis loads local files offline, uses native `generate_voice_design` with the selected profile description, streams 0.5-second chunks, serializes generation per provider process and propagates the caller's abort signal. Shared WAV handling validates output, applies pitch-preserving speed adjustment and cleans partial files/processes after failure or cancellation. Synthesis scratch files use the current build's audio directory. The model is loaded per synthesis call.

This provider uses the selected 1.7B VoiceDesign model, not the previously benchmarked 0.6B Base model; Base's memory/speed figures do not describe this implementation. VoiceDesign profiles guide timbre and delivery but do not guarantee an identical speaker identity across different utterances. No fallback to another model/engine is silent.

## Qwen3-TTS Base on Apple Silicon

Choose **Qwen3-TTS · Base 1.7B** as a separate Speech engine. Base conditions speech on reference audio and its transcript. It has no built-in named speakers; Kiteva supplies **Female narrator** and **Male narrator**, grouped by gender. These are synthetic Kiteva defaults generated with VoiceDesign, not recordings of a third-party speaker. Each supports Chinese and English, and changing language preserves the selected reference voice.

```sh
npm run speech:setup:qwen:base
# Or during installation:
./install.sh --speech qwen-base
```

The pinned model is `mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16` at revision `a6eb4f68e4b056f1215157bb696209bc82a6db48`, under `models/qwen3-tts-base/checkpoint/`. Base and VoiceDesign share the managed MLX Python environment and serialized generation queue, but use separate model folders, provider folders and catalogs. Base setup needs no VoiceDesign or Kokoro model: its two small reference WAVs and exact transcripts are bundled under `assets/speech/qwen3-tts-base/` and `src/shared/qwen-base-tts-catalog.json`.

Both providers reuse readiness retries, cancellation, temporary-output cleanup, speed adjustment and audio validation. Missing or invalid reference recordings fail readiness with the actual diagnostic. Base audio caches include the reference transcript and revision; increment the catalog revision when replacing a reference WAV. Existing VoiceDesign selections and IDs remain unchanged. This initial provider exposes the two bundled references; it does not add a user voice-upload workflow.

### Bundled original narrator reference

**Original narrator** is an additional Base option backed by the user-supplied reference excerpt at `assets/speech/qwen3-tts-base/original-narrator.wav`. It is a system asset included with the codebase so other installations can use the same voice after Base model setup. The catalog contains its matching transcript and reference revision. It supports reference-based Chinese and English synthesis. Generated previews, test outputs and downloaded model weights remain outside the bundled assets and are ignored by Git.

### Subtitle naming and saved projects

On-screen text is called **subtitles** throughout settings, script items, prompts, storyboard JSON and exports. Requests use `subtitles`, script items use `showSubtitles`, and prepared text uses `generatedSubtitles`. Selectable narration and subtitle tracks are configured separately; see [video languages](video-languages.md).

Legacy `lyrics`, `showLyrics` and `generatedLyrics` fields are normalized when loading requests, projects, drafts and saved storyboards. Canonical fields take precedence when both names are present. Supplied text is preserved. The client includes legacy wire aliases so updating the interface does not require interrupting a build running in an older backend process. Genuine song lyrics in source descriptions and catalog entries retain their musical meaning.
