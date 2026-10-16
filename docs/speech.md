# Speech and vocals

Turn on **Show lyrics on screen** in the Assistant's Music step. **Speech / vocals** is also available in Settings. Choose on-screen text only, local narration, or an attached spoken/sung recording. Choices are saved with the draft and project. Turning lyrics off retains the choices but disables voice generation and mixing. Existing projects remain voice-off.

Local narration supports Kokoro voices through an app-owned provider adapter. Language selects the matching voices; speed is 0.75–1.5×. Listen generates a short sample only when clicked. Choose to speak the displayed words, write a separate script, or supply a script. Writing instructions guide script content, not unsupported emotional controls on the voice model. Generated singing is unavailable; TTS is not singing. Upload a voice-only recording under Music for recorded vocals.

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

Pocket TTS is planned to use its own `pocket-tts.ts` adapter and `models/pocket-tts/` directory. It is not yet implemented or available in settings. Model weights and voice data are downloaded runtime files, not bundled source code.

## Pipeline

Previews remain silent and never generate voice. For full films Kiteva prepares voice before visual implementation, using the existing small text-model route only when a separate script is requested. It synthesizes each supplied line, measures the actual WAV duration, and supplies line-level timing to the visual builder. These are not word timestamps or forced alignment. Uploaded recordings have no inferred caption timings.

Scripts and completed speech tracks are checkpointed in the job's audio folder. Changing the script, voice, speed or relevant brief invalidates the cache; unchanged visual repairs reuse the track. Cancellation does not publish an incomplete track. Audio longer than the requested film is rejected with a specific customer message, never cut silently.

The composition produces background music/effects only. After HyperFrames, Multiplane or the existing Remotion fallback renders, Kiteva mixes the prepared voice into the master with FFmpeg, ducks the original soundtrack beneath it, limits peaks and validates the resulting export. Video frames are copied during mixing. Viewing WebM copies retain the master audio; desktop clips remain silent. The renderer does not synthesize speech.

An unavailable runtime, overlong recording or failed mix is reported as a speech error. App-owned mixing failures are not sent to a visual corrector. Existing generation transport, provider credentials and renderer choice are unchanged.

## Feature verification

Run type checks, lint and tests, including `speech-settings`, `speech-audio`, `speech-routes` and `speech-ui`. Browser verification should cover Lyrics off/on, voice choices, Listen, script edits, saved drafts, uploaded recordings and review. Test rendering and decoding with both renderer choices. Real model installation/synthesis is an explicit setup/smoke step rather than a dependency of every test run.
