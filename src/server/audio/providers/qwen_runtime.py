"""Shared offline Apple Silicon runtime for Qwen VoiceDesign and Base speech."""
import argparse
import contextlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import sys

def main(MODEL, REVISION, VERSION, default_voice="qwen_bright_female", model_type="voice_design"):
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", required=True)
    parser.add_argument("--catalog", required=True)
    parser.add_argument("--setup", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--voice", default=default_voice)
    parser.add_argument("--language", choices=["en", "zh"])
    parser.add_argument("--text-file")
    parser.add_argument("--output")
    args = parser.parse_args()
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        raise RuntimeError("Qwen3-TTS MLX requires an Apple Silicon Mac")
    root = Path(args.models).resolve()
    catalog = json.loads(Path(args.catalog).read_text())
    voices = {voice["id"]: voice for voice in catalog["voices"]}
    if args.voice not in voices:
        raise ValueError("Choose a catalogued Qwen3-TTS voice profile")
    manifest_file = root / "ready.json"
    if args.setup:
        from huggingface_hub import snapshot_download
        snapshot_download(MODEL, revision=REVISION, local_dir=str(root / "checkpoint"))
        files = [str(file.relative_to(root)) for file in (root / "checkpoint").rglob("*")
                 if file.is_file() and ".cache" not in file.parts]
        for name in files:
            if not (root / name).is_file() or not (root / name).stat().st_size:
                raise RuntimeError(f"Missing Qwen3-TTS model file: {name}")
        temporary = manifest_file.with_suffix(".tmp")
        temporary.write_text(json.dumps({"version": VERSION, "model": MODEL,
            "revision": REVISION, "files": files}, indent=2))
        temporary.replace(manifest_file)
        print("Qwen3-TTS model and voice profiles prepared")
        return
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    manifest = json.loads(manifest_file.read_text())
    if (manifest["version"] != VERSION or manifest["model"] != MODEL
            or manifest["revision"] != REVISION):
        raise RuntimeError("Qwen3-TTS setup is outdated; rerun speech:setup:qwen")
    for name in manifest["files"]:
        file = (root / name).resolve()
        file.relative_to(root)
        if not file.is_file() or file.stat().st_size == 0:
            raise RuntimeError(f"Missing Qwen3-TTS model file: {name}")
    if importlib.metadata.version("mlx-audio") != "0.6.2":
        raise RuntimeError("Qwen3-TTS requires the pinned mlx-audio 0.6.2 runtime")
    import mlx.core as mx
    if not mx.metal.is_available():
        raise RuntimeError("Apple Metal is unavailable for Qwen3-TTS")
    if model_type == "base":
        import soundfile as sf
        reference = (Path(args.catalog).resolve().parent / voices[args.voice]["referenceAudio"]).resolve()
        if not voices[args.voice]["referenceText"].strip():
            raise RuntimeError("Qwen3-TTS Base requires a reference transcript")
        if not reference.is_file() or sf.info(str(reference)).duration <= 0:
            raise RuntimeError(f"Missing or invalid Qwen3-TTS Base reference: {reference}")
    if args.check:
        print("ready")
        return
    if not args.text_file or not args.output:
        parser.error("--text-file and --output are required")
    import numpy as np
    import soundfile as sf
    from mlx_audio.tts.utils import load_model
    voice = voices[args.voice]
    with contextlib.redirect_stdout(sys.stderr):
        model = load_model(str(root / "checkpoint"))
        if model.config.tts_model_type != model_type:
            raise RuntimeError(f"Qwen3-TTS requires the selected {model_type} checkpoint")
        mx.random.seed(42)
        text = Path(args.text_file).read_text()
        language = {"en": "english", "zh": "chinese"}[args.language or voice["language"]]
        options = dict(text=text, stream=True, streaming_interval=0.5,
                       max_tokens=4096, verbose=False)
        if model_type == "base":
            results = model.generate(ref_audio=str(reference), ref_text=voice["referenceText"],
                                     lang_code=language, **options)
        else:
            results = model.generate_voice_design(instruct=voice["description"],
                                                  language=language, **options)
        chunks = [np.asarray(result.audio, dtype=np.float32).reshape(-1) for result in results]
    audio = np.concatenate(chunks)
    if not len(audio) or not np.isfinite(audio).all():
        raise RuntimeError("Qwen3-TTS returned no valid audio")
    sf.write(args.output, audio, model.sample_rate, subtype="PCM_16")
