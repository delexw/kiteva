# Local speech models

Downloaded weights stay in visible, engine-specific directories and are ignored by Git:

- `kokoro/kokoro-v1.0.onnx` — Kokoro model.
- `kokoro/voices-v1.0.bin` — Kokoro voice data.
- `pocket-tts/` — reserved for the planned Pocket TTS integration; not implemented yet.

Run `npm run speech:setup` to install Kokoro. Existing HyperFrames cached files are copied when available; otherwise setup downloads them. Original cache files are preserved. Python environments and generated project audio remain separate from these model files.

Provider TypeScript implementations and their shared interface are tracked under `src/server/audio/providers`. See [speech setup](../docs/speech.md).
