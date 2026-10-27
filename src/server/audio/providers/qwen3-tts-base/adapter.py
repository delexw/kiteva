"""Base model configuration for local reference-based speech."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from qwen_runtime import main

if __name__ == "__main__":
    main("mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16",
         "a6eb4f68e4b056f1215157bb696209bc82a6db48", 2,
         default_voice="qwen_base_female", model_type="base")
