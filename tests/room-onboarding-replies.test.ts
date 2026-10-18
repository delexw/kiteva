import { expect, it } from "vitest";
import { RequestSchema } from "../src/shared/contracts";
import { roomOnboardingReplies, roomSettingsReply } from "../src/client/room/onboarding-replies";

const id = "00000000-0000-4000-8000-000000000001";
const assets = [{ id, originalName: "reference.png", kind: "image/png", bytes: 120 }];
const styles = [{ id: "style-056", name_en: "Mosaic" }];
const request = () =>
  RequestSchema.parse({
    instructions: "Explain an idea for the team.",
    provider: "claude",
    mainModel: "claude-opus-5-5",
    duration: 90,
    frameRate: 60,
    resolution: "1440p",
    selectedStyleIds: ["style-056"],
    candidateCount: 0,
    renderer: "multiplane",
    assetIds: [id],
    urls: ["https://example.com"],
    requirements: {
      main: { instructions: "Read the notes", assetIds: [] },
      images: { instructions: "Use a bright palette", assetIds: [id] },
      music: { instructions: "An upbeat groove", assetIds: [] },
      urls: { instructions: "Capture the working app" },
    },
    lyrics: { mode: "provided", text: "Here are the actual lyrics" },
    speech: {
      mode: "narration",
      voice: "am_michael",
      source: "provided",
      speed: 1.1,
      text: "Here is the actual narration",
      instructions: "Speak warmly",
    },
  });
it("includes full prompts, file names, URL instructions, lyrics and speech in prior replies", () => {
  const replies = roomOnboardingReplies(request(), assets, styles);
  expect(replies[0].text).toBe("Explain an idea for the team.");
  expect(replies[1].text).toContain("Read the notes");
  expect(replies[2].text).toContain("Use a bright palette");
  expect(replies[2].text).toContain("reference.png");
  expect(replies[3].text).toContain("https://example.com");
  expect(replies[3].text).toContain("Capture the working app");
  for (const value of [
    "Here are the actual lyrics",
    "Michael",
    "1.1×",
    "Here is the actual narration",
    "Speak warmly",
  ])
    expect(replies[5].text).toContain(value);
});
it("lists actual generation settings and selected style names rather than counts", () => {
  const reply = roomSettingsReply(request(), styles);
  for (const value of [
    "Claude Opus 5.5",
    "90 seconds",
    "16:9",
    "1440p",
    "60 fps",
    "Multiplane",
    "Selected Motion Graphics: Mosaic",
    "build selected Motion Graphics directly",
  ])
    expect(reply).toContain(value);
});
it("recomputes edited answers and omits removed attachments", () => {
  const edited = { ...request(), instructions: "The revised project idea.", assetIds: [] };
  const replies = roomOnboardingReplies(edited, assets, styles);
  expect(replies[0].text).toBe("The revised project idea.");
  expect(replies[2].text).not.toContain("reference.png");
});
it("handles optional steps and page settings without video or inactive voice settings", () => {
  const page = RequestSchema.parse({
    instructions: "Make an interactive page",
    outputType: "page",
    viewport: "mobile",
  });
  const replies = roomOnboardingReplies(page, [], []);
  expect(replies[1]).toEqual({ text: "Skipped", skipped: true });
  expect(replies[3]).toEqual({ text: "No websites", skipped: true });
  expect(replies[4]).toEqual({ text: "Skipped", skipped: true });
  expect(replies[6].text).toContain("Preview viewport: Mobile");
  expect(replies[6].text).not.toContain("Frame rate");
  const video = request();
  if (video.outputType !== "video") throw Error("Expected video fixture");
  video.lyrics = { mode: "off" };
  expect(roomOnboardingReplies(video, assets, styles)[5].text).toContain("Voice: Michael");
  expect(roomSettingsReply(video, styles)).not.toContain("Michael");
});

it("keeps speech and narration in their own reply without repeating them in generation settings", () => {
  const replies = roomOnboardingReplies(request(), assets, styles);
  expect(replies[4].text).toContain("An upbeat groove");
  expect(replies[4].text).not.toContain("Here is the actual narration");
  expect(replies[5].text).toContain("Here is the actual narration");
  expect(replies[5].text).toContain("Voice: Michael");
  for (const value of [
    "Speech:",
    "Voice:",
    "Script source:",
    "Here is the actual narration",
    "Speak warmly",
  ])
    expect(replies[6].text).not.toContain(value);
});
