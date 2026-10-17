# Local speech models

Downloaded weights stay in visible, engine-specific directories and are ignored by Git
(`/models/kokoro/` and `/models/pocket-tts/` in `.gitignore`). A fresh clone has none of them.
Each engine's setup command downloads its files once. Synthesis never downloads models.

## Kokoro

- `kokoro/kokoro-v1.0.onnx`: Kokoro model.
- `kokoro/voices-v1.0.bin`: Kokoro voice data.

Run `npm run speech:setup` to install Kokoro. Existing HyperFrames cached files are copied when
available; otherwise setup downloads them from the
[kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) model release. Original cache files are
preserved. The Python environment lives separately in `.data/speech-venv`.

## Pocket TTS

[Pocket TTS](https://pypi.org/project/pocket-tts/) is implemented as its own provider
(`src/server/audio/providers/pocket-tts.ts`), pinned to `pocket-tts==3.3.0`
(`scripts/pocket-tts-requirements.txt`).

- `pocket-tts/languages/<language>/`: a local-only `config.yaml`, a `ready.json` readiness manifest and
  `voices/` with the exported preset voice states, for each of the seven languages in
  `src/shared/pocket-tts-catalog.json` (Dutch, English, French, German, Italian, Portuguese and Spanish).
- `pocket-tts/hub/`, `pocket-tts/huggingface/` (and `pocket-tts/torch/` if created): the Hugging Face and
  PyTorch caches the setup script points at, holding the downloaded model
  weights ([kyutai/pocket-tts-without-voice-cloning](https://huggingface.co/kyutai/pocket-tts-without-voice-cloning)).
  Synthesis loads them with Hugging Face offline mode on.
- The current setup script doesn't write `config.yaml`, `ready.json` or `voices/` directly under
  `pocket-tts/`. If your copy has them at that level, they aren't read by the per-language readiness check.

Run `npm run speech:setup:pocket` to install every language, or
`npm run speech:setup:pocket -- --language italian` for one. The Python environment lives separately in
`.data/pocket-tts-venv`. `POCKET_TTS_PYTHON` can point at another environment with the same pinned
package. Voice cloning isn't exposed.

## Shared

Python environments and generated project audio stay separate from these model files. Model weights and
voice data keep their upstream licenses.

Provider TypeScript implementations and their shared interface are tracked under
`src/server/audio/providers`. See [speech setup](../docs/speech.md).
