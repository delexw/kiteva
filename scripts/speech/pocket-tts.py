"""Pocket TTS adapter. Downloads occur only with --setup; synthesis is offline."""
import contextlib
import sys
import argparse
import importlib.metadata
import json
import os
from pathlib import Path

catalog = json.loads((Path(__file__).resolve().parents[2] / "src/shared/pocket-tts-catalog.json").read_text())
VERSION = catalog["version"]
languages = {language["model"]: language for language in catalog["languages"] if language["id"] != "zh"}
parser = argparse.ArgumentParser()
parser.add_argument("--models", required=True)
parser.add_argument("--language", choices=languages, default="english")
parser.add_argument("--setup", action="store_true")
parser.add_argument("--check", action="store_true")
parser.add_argument("--serve", action="store_true")
parser.add_argument("--voice")
parser.add_argument("--text-file")
parser.add_argument("--output")
args = parser.parse_args()
language = languages[args.language]
voices = [voice["id"] for voice in catalog["voices"] if voice["language"] != "zh"]
selected_voice = args.voice or language["defaultVoice"]
if selected_voice not in voices:
    parser.error("Choose an official Pocket TTS voice")
root = Path(args.models).resolve()
folder = root / "languages" / args.language
os.environ["HF_HOME"] = str(root / "huggingface")
os.environ["HF_HUB_CACHE"] = str(root / "hub")
os.environ["TORCH_HOME"] = str(root / "torch")
if not args.setup:
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_DATASETS_OFFLINE"] = "1"
if importlib.metadata.version("pocket-tts") != VERSION:
    raise RuntimeError(f"Install pocket-tts=={VERSION} using the setup command")
manifest_path = folder / "ready.json"
if args.setup:
    folder.mkdir(parents=True, exist_ok=True)
    os.chdir(root)
    from pocket_tts import TTSModel, export_model_state
    from huggingface_hub import hf_hub_download, snapshot_download
    from pocket_tts.utils.utils import get_predefined_voice
    import yaml

    # Prefetch the official embedding snapshot in parallel, then use the model's
    # native preset loader. Hugging Face owns retries, cache locks and integrity.
    preset_url = get_predefined_voice(args.language, voices[0])
    owner, repository, filename = preset_url[5:].split("/", 2)
    filename, _, revision = filename.partition("@")
    snapshot_download(
        repo_id=f"{owner}/{repository}", revision=revision or None,
        allow_patterns=[filename.rsplit("/", 1)[0] + "/*.safetensors"],
        cache_dir=str(root / "hub"), max_workers=8,
    )
    model = TTSModel.load_model(language=args.language)
    voice_directory = folder / "voices"
    voice_directory.mkdir(exist_ok=True)
    files = set()
    for voice in voices:
        state = model.get_state_for_audio_prompt(voice)
        voice_file = voice_directory / f"{voice}.safetensors"
        export_model_state(state, str(voice_file))
        files.add(str(voice_file.relative_to(root)))
    config = model.config.model_dump(mode="json")
    if not model.has_voice_cloning:
        config["weights_path"] = config["weights_path_without_voice_cloning"]
    config["weights_path_without_voice_cloning"] = None

    def localize(value):
        if isinstance(value, dict):
            return {key: localize(item) for key, item in value.items()}
        if isinstance(value, list):
            return [localize(item) for item in value]
        if isinstance(value, str) and value.startswith("hf://"):
            owner, repository, filename = value[5:].split("/", 2)
            filename, separator, revision = filename.partition("@")
            file = Path(hf_hub_download(
                repo_id=f"{owner}/{repository}", filename=filename,
                revision=revision if separator else None, local_files_only=True,
            )).resolve()
            relative = str(file.relative_to(root))
            files.add(relative)
            return relative
        if isinstance(value, str) and value.startswith(("https://", "http://")):
            raise RuntimeError("Model config contains an unsupported remote asset")
        return value

    config_path = folder / "config.yaml"
    config_path.write_text(yaml.safe_dump(localize(config)))
    files.add(str(config_path.relative_to(root)))
    temporary = folder / "ready.tmp.json"
    temporary.write_text(json.dumps({
        "version": VERSION, "language": args.language,
        "files": sorted(files), "voices": voices,
    }, indent=2))
    temporary.replace(manifest_path)
    print(f"Pocket TTS {language['label']}: model and {len(voices)} voices prepared")
else:
    manifest = json.loads(manifest_path.read_text())
    if (manifest["version"] != VERSION or manifest["voices"] != voices
            or manifest["language"] != args.language):
        raise RuntimeError("Pocket TTS setup is outdated; rerun setup for this language")
    for name in manifest["files"]:
        file = (root / name).resolve()
        file.relative_to(root)
        if not file.is_file() or file.stat().st_size == 0:
            raise RuntimeError(f"Pocket TTS model file is unavailable: {name}")
    if args.check:
        print("ready")
    else:
        if not args.serve and (not args.text_file or not args.output):
            parser.error("--text-file and --output are required for synthesis")
        with contextlib.redirect_stdout(sys.stderr):
            from pocket_tts import TTSModel
            import scipy.io.wavfile
            os.chdir(root)
            model = TTSModel.load_model(config=str(folder / "config.yaml"))
        voice_states = {}

        def synthesize(voice_name, text_file, output):
            if voice_name not in voices:
                raise ValueError("Choose an official Pocket TTS voice")
            if voice_name not in voice_states:
                voice_states[voice_name] = model.get_state_for_audio_prompt(
                    str(folder / "voices" / f"{voice_name}.safetensors"))
            # Native copy_state prevents a previous utterance mutating the cached voice.
            audio = model.generate_audio(voice_states[voice_name], Path(text_file).read_text(), copy_state=True)
            scipy.io.wavfile.write(output, model.sample_rate, audio.detach().cpu().numpy())

        if args.serve:
            for line in sys.stdin:
                request = json.loads(line)
                try:
                    with contextlib.redirect_stdout(sys.stderr):
                        synthesize(request["voice"], request["textFile"], request["output"])
                    response = {"id": request["id"], "ok": True}
                except Exception as error:
                    response = {"id": request["id"], "ok": False, "error": str(error)}
                print(json.dumps(response), flush=True)
        else:
            synthesize(selected_voice, args.text_file, args.output)
