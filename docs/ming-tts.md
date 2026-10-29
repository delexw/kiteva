# Ming-3.0-TTS 0.5B

Ming is a separate local narration provider under `src/server/audio/providers/ming-tts/`. Its catalog and neutral policy are in `src/shared/ming-tts-catalog.json`. It uses only the dense **0.5B** checkpoint, not Tiny (the 7.9B MoE).

## Languages and voices

All seven upstream target languages are available: Chinese, English, Japanese, Korean, German, French and Spanish. They are available in the global narration/subtitle language selection as well as provider settings; the previous two-track limit is removed. One configured voice can speak all seven languages. Select the voice separately for each language profile. When adding a language that the previous engine cannot speak, its new settings profile defaults to a neutral Ming voice so it can be edited. Saved profiles are retained; production inference never silently switches providers.

The dropdown contains all **21 sampled Chinese female voices** from the upstream **Chinese voices without emotion variants** section, excluding the explicitly named sad voice. Existing Chinese male voices and the three English voices remain available. Emotion-suffixed variants are not offered. Gender groups are available in the voice selector, and the established 灵小柔 default is preserved.

## Neutral-only inference contract

The CUDA adapter builds this exact task shape:

```python
model.synthesize(
    task="IP",
    text=spoken_text,
    language_id=selected_language,
    controls={"ip": selected_catalog_voice},
    use_zero_spk_emb=True,
    cfg=2.0,
    sigma=0.25,
    temperature=0.0,
    output_path=output,
)
```

Do **not** add `emotion="中性"`: upstream IP mode accepts only the `ip` control. Emotion, freeform instructions and style/voice-design controls are not exposed. All 14 upstream inline expression tags and model control tokens are rejected before inference, in both TypeScript and Python. The CUDA backend checks the upstream expression vocabulary; the MLX backend pins its runtime version and validates that its built-in voice caption leaves emotion, style and delivery attributes unset. Model instructions remind narration agents to supply plain spoken words. Voice timbre and natural prosody still vary; disabling expression controls is not a mathematical guarantee of acoustically flat delivery.

Speed and volume use existing application audio processing. They do not add Ming BASIC or EMOTION task controls. WAV publication, cancellation, queueing, cleanup and project media placement reuse the existing speech pipeline. No network access or automatic model downloads occur during narration.

## Setup and platform support

Apple Silicon uses a dedicated **MLX-Audio 0.6.2** environment and the pinned `mlx-community/Ming-3.0-tts-0.5B-bf16` checkpoint. Other supported hosts use the upstream NVIDIA CUDA backend. Intel Macs are not supported. Runtime selection is explicit by platform, without a provider fallback. The macOS `install.sh` does not automatically install Ming; run its dedicated setup command.

On Apple Silicon, or a CUDA host with compatible Python, FFmpeg and Node installed:

```sh
SPEECH_SETUP_PYTHON=python3.11 npm run speech:setup:ming
```

The script creates a dedicated `.data/ming-tts-venv`. On Apple Silicon it installs pinned MLX dependencies, checks Metal, and prepares the MLX checkpoint under `models/ming-tts/mlx-checkpoint/`. On CUDA it installs the pinned upstream requirements, checks CUDA before downloading weights, and prepares the managed source/checkpoint under `models/ming-tts/`. Source and model revisions are pinned in the catalog. `MING_TTS_PYTHON` can select an existing compatible environment for inference. A readiness check verifies installed files, pinned revisions, imports, the selected Metal/CUDA backend and the neutral voice contract; it does not render a sample or guarantee available GPU memory. A real synthesis failure reports its actual diagnostic.

## Verification

Tests use mocked process/provider transports and local fixtures only. The real Python request builders for CUDA and MLX are executed without importing the model or downloading weights. Tests cover all voices and seven languages, rejection of expression tags and unsupported selections, cancellation, readiness retry, application-owned speed processing and temporary-file cleanup. Real CUDA synthesis and audio quality are not verified by these tests.

## Sources

- [Upstream repository](https://github.com/inclusionAI/Ming-3.0-tts)
- [Task contract](https://github.com/inclusionAI/Ming-3.0-tts/blob/9332fb9443325d4726ce02cefd4ec1c211df4079/tts_tasks.py)
- [Control reference and voices](https://github.com/inclusionAI/Ming-3.0-tts/blob/9332fb9443325d4726ce02cefd4ec1c211df4079/cookbooks/instruction_en.md)

- [MLX model and Apple Silicon runtime](https://huggingface.co/mlx-community/Ming-3.0-tts-0.5B-bf16)

## Original narrator reference voice

“Original narrator” uses the checked-in `assets/speech/ming-tts/original-narrator.wav`. Its transcript, reference revision and relative asset path live directly in the Ming catalog. No removed provider catalog or runtime is needed. CUDA receives `task="TTS"`, `prompt_wav_path` and `prompt_text`; MLX receives `ref_audio` and `ref_text`. Neither receives IP, emotion or style instructions. Zero speaker conditioning is disabled so the reference can condition the voice. The reference definition participates in the speech cache identity. All seven target languages remain selectable. Natural delivery can carry into the result; exact voice matching and emotionless delivery are not guaranteed.
