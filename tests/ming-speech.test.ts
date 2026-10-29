import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mingLanguages,
  mingVoices,
  mingBlockedTags,
  SpeechSettingsSchema,
  speechLanguage,
  speechVoiceDefinition,
} from "../src/shared/speech";
import { VideoRequestSchema } from "../src/shared/domains/video";
import { selectLanguageTrackLanguages, LanguageTracksSchema } from "../src/shared/language-tracks";
import { deliverySpeech, videoLanguages } from "../src/shared/video-language";
import { appRoot } from "../src/server/runtime/config";

vi.mock("../src/server/runtime/process", () => ({ command: vi.fn() }));
vi.mock("../src/server/rendering/video-probe", () => ({
  probeVideo: vi.fn(async () => ({
    streams: [{ codec_type: "audio" }],
    format: { duration: "1.5" },
  })),
}));
import { command } from "../src/server/runtime/process";
import { mingSpeechProvider, mingRuntimeArguments } from "../src/server/audio/providers/ming-tts";
import { speechProvider } from "../src/server/audio/providers";
const folders: string[] = [];
beforeEach(() => {
  vi.mocked(command)
    .mockReset()
    .mockImplementation(async (executable, args) => {
      if (args.includes("--output"))
        await writeFile(args[args.indexOf("--output") + 1], "fixture audio");
      if (executable === "ffmpeg") await writeFile(args.at(-1)!, "fixture tempo audio");
      return "ready";
    });
});
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
it("supports all seven target languages without losing the configured voice", () => {
  expect(mingLanguages.map((item) => item.id).sort()).toEqual([
    "de",
    "en",
    "es",
    "fr",
    "ja",
    "ko",
    "zh",
  ]);
  expect(
    mingVoices.filter((voice) => voice.language === "zh" && voice.gender === "female" && voice.ip),
  ).toHaveLength(21);
  expect(
    mingVoices.some(
      (voice) => voice.ip === "悲伤女声" || /_(中性|高兴|悲伤|愤怒|恐惧|惊讶|厌恶)/.test(voice.ip),
    ),
  ).toBe(false);
  expect(new Set(mingVoices.map((item) => item.gender))).toEqual(new Set(["female", "male"]));
  for (const voice of mingVoices)
    for (const language of videoLanguages) {
      const settings = SpeechSettingsSchema.parse({
        mode: "narration",
        engine: "ming-tts",
        voice: voice.id,
        language: language.value,
      });
      expect(speechLanguage(voice.id, "ming-tts", language.value)).toBe(language.value);
      expect(deliverySpeech({ speech: settings, outputLanguage: language.value })).toMatchObject({
        voice: voice.id,
        language: language.value,
      });
    }
  const request = VideoRequestSchema.parse({
    instructions: "Explain a workflow",
    speech: { mode: "narration", engine: "ming-tts", voice: mingVoices[0].id },
  });
  const tracks = selectLanguageTrackLanguages(
    request,
    videoLanguages.map((item) => item.value),
  );
  expect(LanguageTracksSchema.parse(tracks).narration).toHaveLength(7);
  expect(tracks.subtitles).toHaveLength(7);
  const unconfigured = VideoRequestSchema.parse({ instructions: "Explain a workflow" });
  const korean = selectLanguageTrackLanguages(unconfigured, ["ko"]);
  expect(LanguageTracksSchema.parse(korean).narration[0].speech).toMatchObject({
    engine: "ming-tts",
    language: "ko",
  });
  expect(speechVoiceDefinition(request.speech)).toMatchObject({ task: "IP", policyRevision: 2 });
  for (const fields of [{ voice: "灵晓声_高兴" }, { voice: "af_heart" }, { language: "pt" }])
    expect(
      SpeechSettingsSchema.safeParse({
        mode: "narration",
        engine: "ming-tts",
        voice: mingVoices[0].id,
        ...fields,
      }).success,
    ).toBe(false);
  expect(speechProvider("ming-tts")).toBe(mingSpeechProvider);
});
it("retries readiness, reports actual failures, and propagates cancellation", async () => {
  vi.mocked(command).mockRejectedValue(Error("CUDA unavailable"));
  expect(await mingSpeechProvider.readiness(new AbortController().signal)).toMatchObject({
    available: false,
    detail: expect.stringContaining("CUDA unavailable"),
  });
  expect(command).toHaveBeenCalledTimes(2);
  await expect(mingSpeechProvider.readiness(AbortSignal.abort(Error("stop")))).rejects.toThrow(
    "stop",
  );
  expect(command).toHaveBeenCalledTimes(2);
});
it("rejects every inline expression tag and model tokens before starting inference", async () => {
  for (const tag of [...mingBlockedTags, "<|im_start|>"])
    await expect(
      mingSpeechProvider.synthesize(
        `Hello ${tag}`,
        "/unused.wav",
        mingVoices[0].id,
        1,
        new AbortController().signal,
        "en",
      ),
    ).rejects.toThrow("expression tags");
  expect(command).not.toHaveBeenCalled();
});
it("uses file-backed text, the selected language and application-owned speed processing", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "ming-speech-"));
  folders.push(folder);
  const file = path.join(folder, "speech.wav");
  expect(
    await mingSpeechProvider.synthesize(
      "An example",
      file,
      mingVoices[0].id,
      1.2,
      new AbortController().signal,
      "ko",
    ),
  ).toBe(1.5);
  const args = vi.mocked(command).mock.calls.find(([, args]) => args.includes("--text-file"))![1];
  expect(args).toEqual(expect.arrayContaining(["--voice", mingVoices[0].id, "--language", "ko"]));
  expect(args).not.toContain("An example");
  expect(args).not.toContain("--emotion");
  expect(args).not.toContain("--instruction");
  expect(await readdir(folder)).toEqual(["speech.wav"]);
});
it("executes the real Python request builder with no model, credentials or network", async () => {
  const code = `import importlib.util,json\nfrom pathlib import Path\nroot=Path.cwd()\nspec=importlib.util.spec_from_file_location('adapter',root/'src/server/audio/providers/ming-tts/adapter.py')\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nc=json.loads((root/'src/shared/ming-tts-catalog.json').read_text())\nfor voice in (v for v in c['voices'] if v['ip']):\n for lang in c['languages']:\n  r=m.synthesis_request('An example',voice['id'],lang['id'],c)\n  assert r['task']=='IP' and r['controls']=={'ip':voice['ip']}\n  assert r['language_id']==lang['id'] and r['use_zero_spk_emb'] is True\n  assert 'instruction' not in r and 'emotion' not in r['controls']\nfor tag in c['blockedTags']+['<|im_start|>']:\n try: m.synthesis_request('Hello '+tag,c['voices'][0]['id'],'en',c)\n except ValueError: pass\n else: raise AssertionError(tag)\nprint('neutral contract passed')`;
  const result = await promisify(execFile)("python3", ["-B", "-c", code], { cwd: appRoot });
  expect(result.stdout).toContain("neutral contract passed");
});

it("selects the native platform adapter without changing voice controls", () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  const arch = Object.getOwnPropertyDescriptor(process, "arch")!;
  try {
    Object.defineProperty(process, "platform", { ...platform, value: "darwin" });
    Object.defineProperty(process, "arch", { ...arch, value: "arm64" });
    expect(mingRuntimeArguments()[0]).toMatch(/ming-tts\/mlx_adapter.py$/);
    Object.defineProperty(process, "platform", { ...platform, value: "linux" });
    expect(mingRuntimeArguments()[0]).toMatch(/ming-tts\/adapter.py$/);
  } finally {
    Object.defineProperty(process, "platform", platform);
    Object.defineProperty(process, "arch", arch);
  }
});
it("maps the shared Python neutral contract into MLX parameters without freeform instructions", async () => {
  const code = `import sys,json
from pathlib import Path
sys.path.insert(0,str(Path.cwd()/'src/server/audio/providers/ming-tts'))
from adapter import synthesis_request
from mlx_adapter import mlx_request
c=json.loads((Path.cwd()/'src/shared/ming-tts-catalog.json').read_text())
for voice in (v for v in c['voices'] if v['ip']):
 for lang in c['languages']:
  r=mlx_request(synthesis_request('An example',voice['id'],lang['id'],c))
  assert r['voice']==voice['ip'] and r['lang_code']==lang['id']
  assert r['speed']==1.0 and r['use_zero_spk_emb'] is True
  assert 'instruct' not in r and 'emotion' not in r
print('MLX neutral contract passed')`;
  expect(
    (await promisify(execFile)("python3", ["-B", "-c", code], { cwd: appRoot })).stdout,
  ).toContain("MLX neutral contract passed");
});

it("uses the shared original reference and transcript in both local runtimes", async () => {
  expect(
    speechVoiceDefinition({ mode: "narration", engine: "ming-tts", voice: "ming_original_female" }),
  ).toMatchObject({
    task: "TTS",
    reference: { id: "ming_original_female", revision: 1 },
  });
  const code = `import sys,json
from pathlib import Path
sys.path.insert(0,str(Path.cwd()/'src/server/audio/providers/ming-tts'))
from adapter import synthesis_request
from mlx_adapter import mlx_request
p=Path.cwd()/'src/shared/ming-tts-catalog.json'
c=json.loads(p.read_text())
for language in c['languages']:
 r=synthesis_request('A reference narration','ming_original_female',language['id'],c,p)
 assert r['task']=='TTS' and r['use_zero_spk_emb'] is False
 assert r['use_spk_emb'] is False and 'controls' not in r and 'instruction' not in r
 assert Path(r['prompt_wav_path']).name=='original-narrator.wav'
 assert r['prompt_text'] and r['language_id']==language['id']
 m=mlx_request(r)
 assert m['ref_audio']==r['prompt_wav_path'] and m['ref_text']==r['prompt_text']
 assert 'voice' not in m and 'instruct' not in m and 'emotion' not in m
try: synthesis_request('Hello [Laughter]','ming_original_female','en',c,p)
except ValueError: pass
else: raise AssertionError('Expression accepted')
try: synthesis_request('Hello','ming_original_female','en',c)
except ValueError: pass
else: raise AssertionError('Missing reference accepted')
print('Reference contract passed')`;
  expect(
    (await promisify(execFile)("python3", ["-B", "-c", code], { cwd: appRoot })).stdout,
  ).toContain("Reference contract passed");
});
