import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RoomOnboarding } from "../src/client/room/room-onboarding";
import {
  attachRoomStepUploads,
  emptyRoomDraft,
  roomDraftRequest,
  roomDraftStep,
  removeRoomDraftAsset,
  toggleRoomDraftAsset,
  roomMaterialIntake,
  roomMaterialSection,
  roomMaterialSteps,
  roomQuestions,
  roomStepMaterialCounts,
  roomSubmission,
} from "../src/client/room/onboarding";
import { acceptsBriefAttachment } from "../src/shared/brief-sections";
import type { RoomDraft, RoomLibraryAsset } from "../src/shared/room";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const asset = (n: number, name: string, bytes = 1_000_000): RoomLibraryAsset => ({
  id: uuid(n),
  originalName: name,
  kind: "",
  bytes,
});
const draftAt = (step: number, change: Partial<RoomDraft> = {}): RoomDraft => ({
  ...emptyRoomDraft(),
  step,
  request: { instructions: "A short film about a lighthouse" },
  ...change,
});
const render = (draft: RoomDraft, materials: RoomLibraryAsset[] = []) =>
  renderToStaticMarkup(
    <RoomOnboarding
      draft={draft}
      onChange={() => {}}
      materials={materials}
      styles={[]}
      examples={[]}
      onCreated={() => {}}
      onUpload={async () => []}
    />,
  );

it("labels assistant questions, saved replies and the editable composer separately", () => {
  const html = render(draftAt(2));
  expect(html).toContain("Assistant · Idea");
  expect(html).toContain("You · Idea");
  expect(html).toContain("Assistant · Images");
  expect(html).toContain("Your reply · ");
  expect(html).toContain("Editable");
  expect(html).toContain("room-bubble-assistant");
  expect(html).toContain("room-bubble-user");
});

it("gives generation controls a clear settings heading within the existing step", () => {
  const html = render(draftAt(6));
  expect(html).toContain("Generation settings");
  expect(html).toContain("Choose how your project is made.");
  expect(html).toContain('aria-label="Model"');
  expect(html).toContain("Assistant · Settings");
  expect(html).not.toContain("room-reply-label");
});

it("places the review create action in the same footer as Back and Continue", () => {
  const html = render(draftAt(7));
  const footer = html.slice(html.lastIndexOf('class="room-onboarding-actions"'));
  expect(footer).toContain("Back");
  expect(footer).toContain("Create previews");
  expect(footer.indexOf("Back")).toBeLessThan(footer.indexOf("Create previews"));
  expect(html.match(/Create previews/g)).toHaveLength(1);
  expect(
    html.slice(
      html.indexOf('class="room-review"'),
      html.lastIndexOf('class="room-onboarding-actions"'),
    ),
  ).not.toContain("Create previews");
});

it("uses matching titled sections for materials, websites, lyrics and review", () => {
  for (const [step, title] of [
    [1, "Documents"],
    [2, "Reference images"],
    [3, "Website references"],
    [4, "Music and audio"],
    [7, "Review your brief"],
  ] as const) {
    const html = render(draftAt(step));
    expect(html).toContain(`<h3>${title}</h3>`);
    expect(html).toContain("settings-section-heading-icon");
  }
  const music = render(
    draftAt(5, {
      request: { instructions: "A short film about a lighthouse", lyrics: { mode: "write" } },
    }),
  );
  expect(music).toContain("<h3>On-screen lyrics</h3>");
  expect(music).toContain("<h3>Speech / vocals</h3>");
  expect(music).toContain("Choose a narrator or use your own vocal recording.");
});

it("removes an attachment once without reattaching it on duplicate removal", () => {
  const image = asset(1, "reference.png");
  const another = asset(2, "another.png");
  const attached = toggleRoomDraftAsset(toggleRoomDraftAsset(draftAt(2), image), another);
  const removed = removeRoomDraftAsset(attached, image);
  expect(roomDraftRequest(removed).assetIds).toEqual([another.id]);
  expect(roomDraftRequest(removed).requirements?.images.assetIds).toEqual([another.id]);
  expect(removed.assets?.map((item) => item.id)).toEqual([another.id]);
  expect(removeRoomDraftAsset(removed, image)).toBe(removed);
  expect(removed.request.instructions).toBe(attached.request.instructions);
});

it("maps each material step to one upload with its own label, file types and limit", () => {
  expect(
    Object.entries(roomMaterialSteps).map(([step, section]) => [
      roomQuestions[Number(step)].label,
      roomMaterialIntake[section].step,
      roomMaterialIntake[section].upload,
      roomMaterialIntake[section].limit,
    ]),
  ).toEqual([
    ["Documents", "Documents", "Upload documents", "documents"],
    ["Images", "Images", "Upload images", "images"],
    ["Music", "Music", "Upload audio", "audio"],
  ]);
  for (const section of Object.values(roomMaterialSteps))
    for (const extension of roomMaterialIntake[section].accept.split(","))
      expect(roomMaterialSection(`file${extension}`)).toBe(section);
  expect(acceptsBriefAttachment("images", "brief.pdf")).toBe(false);
});

it("renders only the current step's upload, file filter, shelf items and counts", () => {
  const shelf = [asset(1, "brief.pdf"), asset(2, "cover.png"), asset(3, "theme.mp3")];
  const documents = render(draftAt(1), shelf);
  expect(documents).toContain("Upload documents");
  expect(documents).toContain('accept=".md,.txt,.pdf"');
  expect(documents).toContain("brief.pdf");
  expect(documents).not.toContain("cover.png");
  expect(documents).not.toContain("theme.mp3");
  expect(documents).toContain("Documents 0/3");
  expect(documents).toContain("All materials 0/12 · 0/100 MB");
  expect(documents).not.toMatch(/images 0\/8|audio 0\/2|Images 0\/8|Music 0\/2/);

  const images = render(draftAt(2), shelf);
  expect(images).toContain("Upload images");
  expect(images).toContain('accept=".png,.jpg,.jpeg,.webp,.gif,.svg"');
  expect(images).toContain("cover.png");
  expect(images).not.toContain("brief.pdf");
  expect(images).toContain("Images 0/8");
  expect(images).not.toContain("Documents 0/3");

  const music = render(
    draftAt(4, {
      request: {
        instructions: "A short film about a lighthouse",
        lyrics: { mode: "provided", text: "Keep the light on" },
      },
    }),
    shelf,
  );
  expect(music).toContain("Upload audio");
  expect(music).toContain('accept=".wav,.mp3,.m4a"');
  expect(music).toContain("theme.mp3");
  expect(music).not.toContain("cover.png");
  expect(music).toContain("Music 0/2");
  expect(music).not.toContain("Show lyrics on screen");
  expect(music).not.toContain("Keep the light on");
  expect(render(draftAt(3), shelf)).not.toContain("Upload");
});

it("attaches only matching uploads from a mixed selection and explains the rest", () => {
  const { draft, skipped } = attachRoomStepUploads(draftAt(2), "images", [
    asset(1, "cover.png"),
    asset(2, "brief.pdf"),
    asset(3, "theme.mp3"),
    asset(4, "still.webp"),
  ]);
  const request = roomDraftRequest(draft);
  expect(request.assetIds).toEqual([uuid(1), uuid(4)]);
  expect(request.requirements?.images.assetIds).toEqual([uuid(1), uuid(4)]);
  expect(request.requirements?.main.assetIds).toEqual([]);
  expect(request.requirements?.music.assetIds).toEqual([]);
  expect(skipped).toEqual([
    "brief.pdf is saved on your shelf — add it in the Documents step",
    "theme.mp3 is saved on your shelf — add it in the Music step",
  ]);
});

it("stops at the step limit, keeps the rest on the shelf and reuses already attached assets", () => {
  const images = Array.from({ length: 9 }, (_, index) => asset(index + 1, `frame-${index}.png`));
  const first = attachRoomStepUploads(draftAt(2), "images", images);
  expect(roomDraftRequest(first.draft).assetIds).toHaveLength(8);
  expect(first.skipped).toEqual([
    "frame-8.png is saved on your shelf but not added: Use at most 8 images",
  ]);
  expect(roomStepMaterialCounts("images", first.draft.assets)).toEqual([
    { key: "images", label: "Images 8/8", full: true },
    { key: "total", label: "All materials 8/12 · 8/100 MB", full: false },
  ]);
  const again = attachRoomStepUploads(first.draft, "images", [images[0]]);
  expect(again.skipped).toEqual([]);
  expect(roomDraftRequest(again.draft).assetIds).toEqual(roomDraftRequest(first.draft).assetIds);
  const audio = attachRoomStepUploads(draftAt(4), "music", [
    asset(20, "a.mp3"),
    asset(21, "b.wav"),
    asset(22, "c.m4a"),
  ]);
  expect(audio.skipped).toEqual([
    "c.m4a is saved on your shelf but not added: Use at most 2 audio files",
  ]);
});

it("keeps each step's attachments in its own section of the submitted brief", () => {
  let draft = draftAt(1, {
    request: {
      instructions: "A short film about a lighthouse",
      lyrics: { mode: "provided", text: "Keep the light on" },
    },
  });
  draft = attachRoomStepUploads(draft, "main", [asset(1, "brief.pdf"), asset(2, "notes.md")]).draft;
  draft = attachRoomStepUploads(draft, "images", [asset(3, "cover.png")]).draft;
  draft = attachRoomStepUploads(draft, "music", [
    asset(4, "theme.mp3"),
    asset(5, "logo.svg"),
  ]).draft;
  const submitted = roomSubmission(roomDraftRequest(draft));
  expect(submitted.assetIds).toEqual([uuid(1), uuid(2), uuid(3), uuid(4)]);
  expect(submitted.requirements?.main.assetIds).toEqual([uuid(1), uuid(2)]);
  expect(submitted.requirements?.images.assetIds).toEqual([uuid(3)]);
  expect(submitted.requirements?.music.assetIds).toEqual([uuid(4)]);
  expect(submitted.outputType === "video" && submitted.lyrics).toEqual({
    mode: "provided",
    text: "Keep the light on",
  });
});

it("shows editable narration only in Narration / lyrics while preserving its saved reply in later steps", () => {
  const request = {
    instructions: "A short film about a lighthouse",
    lyrics: { mode: "write" as const },
    speech: {
      mode: "narration" as const,
      voice: "am_michael",
      speed: 1,
      source: "provided" as const,
      text: "Our narration stays in Narration / lyrics.",
      instructions: "Speak warmly",
    },
  };
  const music = render(draftAt(5, { request }));
  expect(music).toContain('aria-label="Narration script"');
  const settings = render(draftAt(6, { request }));
  expect(settings).toContain("Generation settings");
  expect(settings).not.toContain('aria-label="Speech and vocals"');
  expect(settings).not.toContain('aria-label="Narration script"');
  expect(settings).toContain("Our narration stays in Narration / lyrics.");
});

it("keeps saved Settings and Review drafts on their original step", () => {
  for (const [oldStep, title] of [
    [5, "Generation settings"],
    [6, "Review your brief"],
  ] as const) {
    const draft = draftAt(oldStep, { stepLayout: undefined });
    expect(roomDraftStep(draft)).toBe(oldStep + 1);
    expect(render(draft)).toContain(`<h3>${title}</h3>`);
    expect(roomDraftRequest(draft).instructions).toBe("A short film about a lighthouse");
  }
  expect(roomDraftStep(draftAt(5))).toBe(5);
  expect(roomDraftStep(draftAt(7))).toBe(7);
  expect(roomDraftStep(draftAt(7, { stepLayout: undefined }))).toBe(7);
});

it("offers narration with lyrics off in a separate Assistant step", () => {
  const draft = draftAt(5, {
    request: {
      instructions: "A short film about a lighthouse",
      lyrics: { mode: "off" },
      speech: {
        mode: "narration",
        source: "provided",
        text: "A spoken story",
        voice: "am_michael",
        speed: 1,
      },
    },
  });
  const speech = render(draft);
  expect(speech).toContain("Assistant · Narration / lyrics");
  expect(speech).toContain('aria-label="Narration script"');
  expect(speech).not.toContain('aria-label="Your lyrics"');
  const music = render({ ...draft, step: 4 });
  expect(music).not.toContain('aria-label="Speech and vocals"');
  expect(music).not.toContain('aria-label="Narration script"');
  expect(roomSubmission(roomDraftRequest(draft))).toMatchObject({
    lyrics: { mode: "off" },
    speech: { text: "A spoken story", source: "provided" },
  });
});
