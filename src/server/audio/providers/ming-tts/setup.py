"""Explicit setup only. Inference never downloads model files."""
import json
from pathlib import Path
import sys


def main():
    root = Path(sys.argv[1]).resolve()
    catalog = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    import torch
    if not torch.cuda.is_available():
        raise RuntimeError("The supported Ming runtime requires NVIDIA CUDA; no model weights were downloaded")
    if not torch.cuda.is_bf16_supported():
        raise RuntimeError("Ming 0.5B requires CUDA bfloat16 support")
    from huggingface_hub import snapshot_download
    checkpoint = root / "checkpoint"
    snapshot_download(catalog["model"], revision=catalog["modelRevision"], local_dir=str(checkpoint),
                      allow_patterns=["*.json", "*.txt", "*.safetensors", "*.onnx"])
    for required in ("config.json", "model.safetensors", "tokenizer.json", "campplus.onnx"):
        if not (checkpoint / required).is_file():
            raise RuntimeError(f"Model checkpoint is incomplete: {required}")
    files = [str(file.relative_to(root)) for folder in (checkpoint, root / "runtime")
             for file in folder.rglob("*") if file.is_file()
             and ".git" not in file.parts and ".cache" not in file.parts]
    manifest = {key: catalog[key] for key in ("model", "modelRevision", "sourceRevision")}
    manifest["files"] = files
    temporary = root / "ready.json.tmp"
    temporary.write_text(json.dumps(manifest, indent=2))
    temporary.replace(root / "ready.json")


if __name__ == "__main__":
    main()
