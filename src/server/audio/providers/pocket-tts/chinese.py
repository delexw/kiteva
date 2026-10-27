"""Pinned Mandarin adapter. Model downloads are setup-only; inference stays offline."""
import argparse
import importlib.util
import json
import os
from pathlib import Path

REPOSITORY = "hustfyb/PocketTTS-ZH-6L"
REVISION = "dbd96b917b7f85443abf249d456db0ffce0d638d"
FILES = ["demo.py", "tn.py", "config.yaml", "tokenizer.model", "model_int8.pt"]
parser = argparse.ArgumentParser()
parser.add_argument("--models", required=True)
parser.add_argument("--setup", action="store_true")
parser.add_argument("--check", action="store_true")
parser.add_argument("--reference")
parser.add_argument("--text-file")
parser.add_argument("--output")
args = parser.parse_args()
root = Path(args.models).resolve()
os.environ["HF_HOME"] = str(root / "huggingface")
os.environ["HF_HUB_CACHE"] = str(root / "hub")
os.environ["TORCH_HOME"] = str(root / "torch")
if args.setup:
    from huggingface_hub import hf_hub_download
    root.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        hf_hub_download(REPOSITORY, name, revision=REVISION, local_dir=str(root))
else:
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
for name in FILES:
    if not (root / name).is_file():
        raise RuntimeError("PocketTTS-ZH needs setup: missing " + name)
import soundfile as sf
import wetext  # noqa: F401 - readiness must also verify normalization dependencies
reference = Path(args.reference).resolve() if args.reference else root / "voices" / "xiaobei.wav"
if not reference.is_file():
    raise RuntimeError("PocketTTS-ZH needs its Mandarin reference voice. Run speech:setup:pocket:zh.")
info = sf.info(str(reference))
if info.duration < 3 or info.duration > 12:
    raise RuntimeError("Use a clean 3–10 second Mandarin reference recording.")
# Pin the upstream inference implementation and int8 format together. Never fetch code during synthesis.
import sys
sys.path.insert(0, str(root))
spec = importlib.util.spec_from_file_location("kiteva_mandarin_model", root / "demo.py")
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
if args.check:
    print(json.dumps({"ready": True, "revision": REVISION}))
elif not args.setup:
    if not args.text_file or not args.output:
        parser.error("Provide --text-file and --output")
    text = Path(args.text_file).read_text(encoding="utf-8").strip()
    if not any("\u3400" <= character <= "\u9fff" for character in text):
        raise RuntimeError("PocketTTS-ZH requires Mandarin text. Select English Pocket TTS for English.")
    output = str(Path(args.output).resolve())
    model = adapter.load()
    adapter.synthesize(model, str(reference), text, output)
