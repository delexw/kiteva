"""VoiceDesign model configuration for the shared local Qwen runtime."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from qwen_runtime import main

MODEL = "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16"
REVISION = "7d3824abff87e49756bb0f83fb5411de75d160c4"
VERSION = 2



if __name__ == "__main__":
    main(MODEL, REVISION, VERSION)
