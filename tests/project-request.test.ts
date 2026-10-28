import { prepareNarrationCapability } from "../src/server/audio/narration";
import { VideoRequestSchema } from "../src/shared/domains/video";
import { expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RequestSchema } from "../src/shared/contracts";
import { writeProjectRequest } from "../src/server/requests/project-request";

it("saves complete settings in the supplied project folder and refreshes them on retry", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "project request "));
  try {
    const workspace = path.join(root, "nested project");
    const request = RequestSchema.parse({ instructions: "An original idea", provider: "claude" });
    const file = await writeProjectRequest(workspace, request);
    expect(file).toBe(path.resolve(workspace, "PROJECT_REQUEST.json"));
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ request });
    const revised = { ...request, instructions: "Updated idea" };
    expect(await writeProjectRequest(workspace, revised)).toBe(file);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ request: revised });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("exposes effective global voices and subtitles to planning without changing the saved idea", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "language-request-"));
  try {
    const request = RequestSchema.parse({
      instructions: "An unchanged original idea",
      outputLanguage: "zh",
      languageTracks: {
        narration: [
          {
            language: "en",
            speech: {
              mode: "narration",
              engine: "kokoro",
              voice: "af_heart",
              speed: 1.1,
              volume: 0.8,
            },
          },
          { language: "zh", speech: { mode: "narration", voice: "zf_xiaobei" } },
        ],
        subtitles: [],
        showSubtitles: false,
        defaultNarration: "en",
        defaultSubtitle: "off",
      },
      scriptItems: [
        {
          id: "example",
          startSeconds: 0,
          endSeconds: 3,
          text: "Keep this exact script",
          showSubtitles: true,
          speech: { mode: "off" },
        },
      ],
    });
    const before = structuredClone(request);
    const file = await writeProjectRequest(workspace, request);
    const modelInput = JSON.parse(await readFile(file, "utf8")).request;
    expect(modelInput.instructions).toBe(request.instructions);
    expect(modelInput.outputLanguage).toBe("zh");
    expect(modelInput.languageTracks).toEqual(
      request.outputType === "video" && request.languageTracks,
    );
    expect(modelInput.scriptItems[0]).toMatchObject({
      text: "Keep this exact script",
      showSubtitles: false,
      speech: { mode: "narration", voice: "af_heart", language: "en", speed: 1.1, volume: 0.8 },
    });
    expect(
      await prepareNarrationCapability(workspace, VideoRequestSchema.parse(modelInput), 3),
    ).toBe(true);
    const config = JSON.parse(
      await readFile(path.join(workspace, "audio/narration-config.json"), "utf8"),
    );
    expect(config.profiles.example).toMatchObject({
      engine: "kokoro",
      voice: "af_heart",
      language: "en",
      speed: 1.1,
      volume: 0.8,
    });
    expect(request).toEqual(before);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
