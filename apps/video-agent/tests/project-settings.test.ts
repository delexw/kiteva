import { expect, it } from "vitest";
import { RequestSchema } from "../src/shared/contracts";
import { projectSettingsDraft } from "../src/client/lib/project-settings";
it("restores the complete saved video settings without replacing user lyrics", () => {
  const draft = projectSettingsDraft(
    RequestSchema.parse({
      instructions: "Introduce a creative workspace",
      provider: "claude",
      preference: "creative",
      candidateCount: 3,
      outputType: "video",
      duration: 45,
      aspectRatio: "9:16",
      lyrics: { mode: "provided", text: "Let an idea fly" },
      urls: ["https://example.com", "https://example.org"],
      pinnedStyleId: "style-046",
    }),
  );
  expect(draft).toMatchObject({
    instructions: "Introduce a creative workspace",
    provider: "claude",
    preference: "creative",
    count: 3,
    outputType: "video",
    duration: 45,
    aspect: "9:16",
    lyricsEnabled: true,
    lyricsText: "Let an idea fly",
    urls: "https://example.com\nhttps://example.org",
    pinnedStyleId: "style-046",
  });
});
it.each([undefined, { mode: "off" }, { mode: "write" }])(
  "restores optional lyric mode %j",
  (lyrics) => {
    const draft = projectSettingsDraft(
      RequestSchema.parse({ instructions: "Explain a creative idea", lyrics }),
    );
    expect(draft.lyricsEnabled).toBe(lyrics?.mode === "write");
    expect(draft.lyricsText).toBe("");
  },
);
it("restores page settings with safe video defaults", () => {
  expect(
    projectSettingsDraft(
      RequestSchema.parse({
        instructions: "Create an interactive story",
        outputType: "page",
        viewport: "mobile",
        candidateCount: 2,
      }),
    ),
  ).toMatchObject({
    outputType: "page",
    viewport: "mobile",
    count: 2,
    duration: "auto",
    aspect: "16:9",
    lyricsEnabled: false,
  });
});

it("restores older long-video settings with the new duration cap and preserves other choices", () => {
  const request = RequestSchema.parse({
    instructions: "Explain a product",
    duration: 120,
    aspectRatio: "9:16",
    candidateCount: 4,
  });
  if (request.outputType !== "video") throw Error("Expected video request");
  const draft = projectSettingsDraft({ ...request, duration: 600 });
  expect(draft).toMatchObject({
    duration: 300,
    aspect: "9:16",
    count: 4,
    instructions: "Explain a product",
  });
});

it("restores manual styles with zero directions", () => {
  const request = RequestSchema.parse({
    instructions: "Explain a product",
    duration: 60,
    candidateCount: 0,
    selectedStyleIds: ["style-018", "style-108"],
  });
  expect(projectSettingsDraft(request)).toMatchObject({
    count: 0,
    selectedStyleIds: ["style-018", "style-108"],
    duration: 60,
  });
});
