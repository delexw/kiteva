"""Run the installed Kokoro API with explicit, app-owned model paths."""
import argparse
from pathlib import Path

from kokoro_onnx import Kokoro
import soundfile

parser = argparse.ArgumentParser()
for name in ("model", "voices", "text-file", "voice", "language", "output"):
    parser.add_argument(f"--{name}", required=True)
parser.add_argument("--speed", required=True, type=float)
args = parser.parse_args()
model = Kokoro(args.model, args.voices)
text = Path(args.text_file).read_text(encoding="utf-8")
if args.language == "zh":
    from misaki.zh import ZHG2P
    text = ZHG2P()(text)
audio, sample_rate = model.create(
    text,
    voice=args.voice,
    speed=args.speed,
    lang="cmn" if args.language == "zh" else args.language,
    is_phonemes=args.language == "zh",
)
soundfile.write(args.output, audio, sample_rate, subtype="PCM_16")
