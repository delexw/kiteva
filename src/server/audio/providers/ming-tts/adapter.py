"""Local-only 0.5B preset and reference voices. No freeform, emotion or style controls."""
import argparse
import json
import os
from pathlib import Path
import re
import sys


def synthesis_request(text, voice, language, catalog, catalog_path=None):
    voices = {item["id"]: item for item in catalog["voices"]}
    if voice not in voices or language not in {item["id"] for item in catalog["languages"]}:
        raise ValueError("Choose a catalogued neutral Ming voice and language")
    if not text.strip() or any(tag in text for tag in catalog["blockedTags"]) or re.search(r"<\|[^>]*\|>", text):
        raise ValueError("Expression tags and model control tokens are disabled for narration")
    preset = voices[voice]
    if preset.get("referenceAudio"):
        if catalog_path is None:
            raise ValueError("Reference voice requires its catalog path")
        reference = preset
        audio = (Path(catalog_path).resolve().parent / reference["referenceAudio"]).resolve()
        import wave
        with wave.open(str(audio)) as wav:
            if wav.getnframes() <= 0:
                raise ValueError("Reference voice audio is empty")
        if not reference["referenceText"].strip():
            raise ValueError("Reference voice transcript is empty")
        return dict(task="TTS", text=text, language_id=language,
                    prompt_wav_path=str(audio), prompt_text=reference["referenceText"],
                    use_zero_spk_emb=False, use_spk_emb=False,
                    cfg=2.0, sigma=0.25, temperature=0.0)
    # IP only accepts ip; even emotion='中性' is an invalid task combination.
    return dict(task="IP", text=text, language_id=language,
                controls={"ip": voices[voice]["ip"]}, use_zero_spk_emb=True,
                cfg=2.0, sigma=0.25, temperature=0.0)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", required=True)
    parser.add_argument("--catalog", required=True)
    parser.add_argument("--voice", required=True)
    parser.add_argument("--language")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--text-file")
    parser.add_argument("--output")
    args = parser.parse_args()
    catalog = json.loads(Path(args.catalog).read_text(encoding="utf-8"))
    preset = next((item for item in catalog["voices"] if item["id"] == args.voice), None)
    if preset is None:
        raise ValueError("Choose a catalogued neutral voice")
    root = Path(args.models).resolve()
    manifest = json.loads((root / "ready.json").read_text())
    if any(manifest.get(key) != catalog[key] for key in ("model", "modelRevision", "sourceRevision")):
        raise RuntimeError("Ming setup is outdated; rerun speech:setup:ming")
    for name in manifest["files"]:
        file = (root / name).resolve()
        file.relative_to(root)
        if not file.is_file() or not file.stat().st_size:
            raise RuntimeError(f"Missing Ming runtime file: {name}")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    sys.path.insert(0, str(root / "runtime"))
    import torch
    if not torch.cuda.is_available():
        raise RuntimeError("Ming's supported inference runtime requires NVIDIA CUDA; Apple Silicon is not verified")
    if not torch.cuda.is_bf16_supported():
        raise RuntimeError("Ming 0.5B requires CUDA bfloat16 support")
    from ming_tts import MingTTS
    from frontend.toolkit import PARALINGUISTIC_TAGS
    if set(PARALINGUISTIC_TAGS) != set(catalog["blockedTags"]):
        raise RuntimeError("Ming expression vocabulary changed; neutral policy requires review")
    synthesis_request("Readiness", args.voice, args.language or preset["language"], catalog, args.catalog)
    if args.check:
        print("Ming 0.5B local runtime and neutral voice policy ready")
        return
    if not args.text_file or not args.output:
        parser.error("--text-file and --output are required for synthesis")
    text = Path(args.text_file).read_text(encoding="utf-8")
    request = synthesis_request(text, args.voice, args.language or preset["language"], catalog, args.catalog)
    torch.manual_seed(1895)
    model = MingTTS(str(root / "checkpoint"), device="cuda:0", text_normalization=False)
    model.synthesize(**request, output_path=args.output)


if __name__ == "__main__":
    main()
