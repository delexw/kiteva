"""Apple Silicon Ming 0.5B; shares the exact neutral selection policy with CUDA."""
import argparse
import importlib.metadata
import json
import os
from pathlib import Path

from adapter import synthesis_request


def mlx_request(request):
    result = dict(text=request["text"], lang_code=request["language_id"], speed=1.0,
                  use_zero_spk_emb=request["use_zero_spk_emb"], cfg_scale=request["cfg"],
                  sigma=request["sigma"], temperature=request["temperature"], ddpm_steps=10)
    if request["task"] == "TTS":
        result.update(ref_audio=request["prompt_wav_path"], ref_text=request["prompt_text"])
    else:
        result["voice"] = request["controls"]["ip"]
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", required=True)
    parser.add_argument("--catalog", required=True)
    parser.add_argument("--setup", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--voice")
    parser.add_argument("--language")
    parser.add_argument("--text-file")
    parser.add_argument("--output")
    args = parser.parse_args()
    catalog = json.loads(Path(args.catalog).read_text(encoding="utf-8"))
    if importlib.metadata.version("mlx-audio") != catalog["mlxAudioVersion"]:
        raise RuntimeError("Ming requires the pinned MLX-Audio runtime; run speech:setup:ming")
    import mlx.core as mx
    if not mx.metal.is_available():
        raise RuntimeError("Apple Metal is unavailable for Ming narration")
    root = Path(args.models).resolve()
    checkpoint = root / "mlx-checkpoint"
    manifest_file = root / "ready-mlx.json"
    identity = {key: catalog[key] for key in ("mlxModel", "mlxRevision", "mlxAudioVersion")}
    if args.setup:
        from huggingface_hub import snapshot_download
        snapshot_download(catalog["mlxModel"], revision=catalog["mlxRevision"], local_dir=str(checkpoint))
        files = [str(file.relative_to(root)) for file in checkpoint.rglob("*")
                 if file.is_file() and ".cache" not in file.parts]
        required = ("config.json", "tokenizer.json", "model.safetensors")
        if not all((checkpoint / name).is_file() for name in required):
            raise RuntimeError("Ming MLX checkpoint is incomplete")
        temporary = manifest_file.with_suffix(".tmp")
        temporary.write_text(json.dumps(dict(**identity, files=files), indent=2))
        temporary.replace(manifest_file)
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    manifest = json.loads(manifest_file.read_text())
    if any(manifest.get(key) != value for key, value in identity.items()):
        raise RuntimeError("Ming MLX setup is outdated; rerun speech:setup:ming")
    for name in manifest["files"]:
        file = (root / name).resolve()
        file.relative_to(root)
        if not file.is_file() or not file.stat().st_size:
            raise RuntimeError(f"Missing Ming MLX model file: {name}")
    config = json.loads((checkpoint / "config.json").read_text())
    if config.get("model_type") != "dense" or config.get("ditar_config", {}).get("patch_size") != 1:
        raise RuntimeError("Choose the Ming 3.0 0.5B dense checkpoint")
    voice = args.voice or catalog["defaultVoice"]
    preset = next((item for item in catalog["voices"] if item["id"] == voice), None)
    if preset is None:
        raise ValueError("Choose a catalogued neutral voice")
    synthesis_request("Readiness", voice, args.language or preset["language"], catalog, args.catalog)
    if not preset.get("referenceAudio"):
        from mlx_audio.tts.models.bailingmm.bailingmm import ming3_instruction, _MING3_VOICE_RE
        if not _MING3_VOICE_RE.fullmatch(preset["ip"]):
            raise RuntimeError("Ming MLX did not recognize the selected built-in voice")
        caption = json.loads(ming3_instruction(ip=preset["ip"]))["audio_sequence"][0]
        if any(caption.get(key) is not None for key in ("情感", "风格", "方言", "语速", "基频", "音量")):
            raise RuntimeError("Ming MLX neutral voice contract changed")
    if args.check or args.setup:
        print("Ming 0.5B Apple Silicon MLX and neutral voice policy ready")
        return
    if not args.text_file or not args.output:
        parser.error("--text-file and --output are required for synthesis")
    request = synthesis_request(Path(args.text_file).read_text(encoding="utf-8"), voice,
                                args.language or preset["language"], catalog, args.catalog)
    from mlx_audio.tts.utils import load_model
    import numpy as np
    import soundfile as sf
    mx.random.seed(1895)
    model = load_model(str(checkpoint))
    parts = list(model.generate(**mlx_request(request), verbose=False))
    if not parts:
        raise RuntimeError("Ming returned no audio")
    audio = np.concatenate([np.asarray(part.audio).reshape(-1) for part in parts])
    if not np.isfinite(audio).all() or not len(audio):
        raise RuntimeError("Ming returned invalid audio")
    sf.write(args.output, audio, model.sample_rate)


if __name__ == "__main__":
    main()
