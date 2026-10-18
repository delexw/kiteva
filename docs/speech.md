# Speech and vocals

The Assistant has separate **Music** and **Narration / lyrics** steps. Choose local narration, an attached spoken/sung recording, and optional on-screen lyrics. Narration with a separate script works with lyrics off; “Speak the displayed lyrics” specifically depends on lyrics. Existing voice-off projects stay voice-off.

Choose **Video language → English / 简体中文** in Settings. Narration follows it by default; the Speech language selector allows an explicit override. Changing language saves the setting without a model call. Supplied scripts and lyrics are translated during project building through the selected AI provider, with usage recorded against the project in Governance. Generated scripts use the chosen language even if the idea is written in another language. See [Video languages](video-languages.md).

Local narration offers Kokoro or Pocket TTS through app-owned provider adapters. Pocket TTS keeps all 27 official presets across seven languages and adds eight Mandarin reference voices through [PocketTTS-ZH-6L](https://huggingface.co/hustfyb/PocketTTS-ZH-6L). The Chinese voices are explicitly synthetic Kokoro references, not official Pocket presets or clones of supplied human recordings. English uses the existing Pocket checkpoint; Chinese uses the separate Mandarin checkpoint. No fallback to another engine is silent. TTS does not generate singing. Upload a voice-only recording under Music for recorded vocals. Changing a language does not translate an uploaded audio recording.

## Local setup

Requires Node 24, FFmpeg and Python 3.10–3.13. Run:

```sh
npm install
npm run speech:setup
```

Setup installs Python requirements in ignored `.data/speech-venv`, copies the existing HyperFrames Kokoro cache when available, or downloads the Kokoro model/voices when absent, and synthesizes `.data/speech-setup.wav`. It does not change system Python. The model and voices live in visible `models/kokoro/` folders, outside `.data`, and are ignored by Git. The previous `~/.cache/hyperframes/tts` files are preserved. A fresh clone needs setup; these runtime files are not repository assets.

`SPEECH_SETUP_PYTHON` selects the interpreter used to create the environment. Kiteva uses the managed environment automatically when present. `HYPERFRAMES_PYTHON` can override it with another Python environment containing the same requirements. `/api/speech/status` checks dependencies and model files twice before reporting unavailable. No synthesis job downloads models or installs packages automatically.

## Provider ownership

Each speech engine owns a separate TypeScript implementation under `src/server/audio/providers`, sharing the `SpeechProvider` interface. `kokoro.ts` owns interpreter selection, readiness and synthesis; `speech.ts` coordinates scripts, timing, caching and mixing. Renderers do not load speech models.

Pocket TTS has its own `pocket-tts.ts` adapter, visible Git-ignored `models/pocket-tts/` directory, and isolated `.data/pocket-tts-venv` Python environment. Install its pinned package (3.3.0), all seven models and 27 preset voice embeddings with:

```sh
npm run speech:setup:pocket
```

Setup downloads all seven official language models, exports all 27 voice states for every language and writes a local-only config plus a readiness manifest per language under `models/pocket-tts/languages/<language>/`. The shared catalog in `src/shared/pocket-tts-catalog.json` supplies both the UI and Python adapter; there is no separate preset subset. To install one language explicitly, use `npm run speech:setup:pocket -- --language italian`. It then synthesizes `.data/pocket-tts-setup.wav`. `POCKET_TTS_PYTHON` can select another environment containing the pinned package. Synthesis loads only local model paths with Hugging Face offline mode enabled; model downloads happen only during explicit setup. A fresh clone needs setup once per engine. Python environments, model weights and voice data remain Git-ignored runtime files.

The Narration / lyrics step keeps script, speed and writing direction when you switch engines, and selects a valid default voice for the new engine. The seven official Pocket languages retain all 27 official voice choices; Mandarin shows all eight compatible synthetic reference voices. `/api/speech/status?engine=pocket-tts&voice=pocket_giovanni` checks the selected language model and retries before reporting unavailable. Listen and generation use the selected engine; neither silently falls back to another model. Pocket speed changes use FFmpeg's pitch-preserving `atempo`, and both providers validate audio before publishing and remove partial files on failure or cancellation. Speech is separate from website capture and from the selected renderer.

## Chinese Pocket TTS

```sh
npm run speech:setup
npm run speech:setup:pocket:zh
```

The second command installs an isolated `.data/pocket-tts-zh-venv` (Pocket TTS 3.0.2 and PyTorch below 2.10, matching the published int8 format), downloads the pinned community checkpoint and inference files to Git-ignored `models/pocket-tts-zh/`, and generates eight explicitly synthetic Mandarin references using Kokoro. Kokoro uses its native Misaki Chinese frontend, not the English phonemizer. The Chinese model adapter is `src/server/audio/providers/pocket-tts-zh.ts`; the existing Pocket adapter routes Mandarin requests to it. Runtime inference is offline. `POCKET_TTS_ZH_PYTHON` overrides only this isolated runtime.

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

Run type checks, lint and tests, including `speech-settings`, `speech-audio`, `speech-routes` and `speech-ui`. Browser verification should cover Lyrics off/on, voice choices, Listen, script edits, saved drafts, uploaded recordings and review. Test rendering and decoding with both renderer choices. Real model installation/synthesis is an explicit setup/smoke step rather than a dependency of every test run.

### Narration volume

Kokoro and Pocket TTS narration is automatically matched to a common perceived level before applying the Narration volume setting (0–200%, default 100%). Listen samples and project narration use the same processing. Peak limiting protects against clipping; high volume may compress peaks. The final mix also limits combined music and voice peaks. Uploaded recordings are unchanged. Existing projects default to 100%; older cached narration is regenerated when next requested.
