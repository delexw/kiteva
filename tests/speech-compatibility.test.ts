import { expect, it } from "vitest";
import { normalizeRetiredSpeechSelections } from "../src/shared/speech-compatibility";
import { RequestSchema, type Run } from "../src/shared/contracts";
import { SpeechProviderIdSchema, speechEngines } from "../src/shared/speech";
import { Store } from "../src/server/jobs/store";

it.each(["qwen3-tts", "qwen3-tts-base"])(
  "migrates saved %s settings without changing their script or mix controls",
  (engine) => {
    const speech = {
      mode: "narration",
      engine,
      voice: "retired-reference",
      language: "zh",
      speed: 1.1,
      volume: 0.8,
      text: "Preserve these exact words",
      source: "provided",
    };
    const saved = {
      instructions: "Explain a workflow",
      speech,
      scriptItems: [
        {
          id: "cue",
          text: "A spoken cue",
          startSeconds: 0,
          endSeconds: 5,
          speech,
          showSubtitles: true,
        },
      ],
      languageTracks: { narration: [{ language: "zh", speech }], subtitles: ["zh"] },
    };
    expect(normalizeRetiredSpeechSelections(speech)).toEqual({
      ...speech,
      engine: "ming-tts",
      voice: "ming_original_female",
    });
    const migrated = RequestSchema.parse(saved);
    if (migrated.outputType === "page") throw Error("Expected video settings");
    for (const profile of [
      migrated.speech,
      migrated.scriptItems?.[0].speech,
      migrated.languageTracks?.narration[0].speech,
    ]) {
      expect(profile).toMatchObject({
        mode: "narration",
        language: "zh",
        speed: 1.1,
        volume: 0.8,
        engine: "ming-tts",
        voice: "ming_original_female",
      });
    }
    expect(saved.speech.engine).toBe(engine);
    expect(SpeechProviderIdSchema.safeParse(engine).success).toBe(false);
  },
);
it("leaves current providers and historical provider usage unchanged", () => {
  const data = {
    speech: { mode: "narration", engine: "kokoro", voice: "af_heart" },
    usage: { engine: "qwen3-tts", cost: 1 },
    nil: null,
  };
  expect(normalizeRetiredSpeechSelections(data)).toEqual(data);
  expect(speechEngines.map((engine) => engine.id).sort()).toEqual([
    "kokoro",
    "ming-tts",
    "pocket-tts",
  ]);
});
it("loads saved projects through the same migration for individual and list reads", () => {
  const store = new Store(":memory:");
  const run: Run = {
    id: "project",
    createdAt: "2026-01-01T00:00:00Z",
    phase: "ready",
    candidates: [],
    jobs: [],
    request: RequestSchema.parse({ instructions: "Explain a workflow" }),
  };
  const legacy = {
    ...run,
    request: {
      ...run.request,
      speech: { mode: "narration", engine: "qwen3-tts-base", voice: "qwen_base_original_female" },
    },
  };
  // Simulate serialized data written by the retired application version.
  store.save(legacy as Run);
  for (const restored of [store.get(run.id), store.list()[0], store.allRuns()[0]])
    expect(restored?.request).toMatchObject({
      speech: { engine: "ming-tts", voice: "ming_original_female" },
    });
  store.close();
});
