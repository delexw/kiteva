import { expect, it } from "vitest";
import { BriefRequirementsSchema } from "../src/shared/brief-sections";
import { applyBriefSectionGuidance } from "../src/server/requests/brief-section-guidance";
import { briefAttachmentInstructions } from "../src/server/requests/brief-attachments";
import { documentContentGuidance } from "../src/server/requests/section-prompts/documents";

const requirements = () =>
  BriefRequirementsSchema.parse({
    main: { instructions: "My document direction." },
    music: { instructions: "  Original music wording.\nKeep this line.  " },
    images: { instructions: "My image direction." },
    urls: { instructions: "My website direction." },
  });
it("passes section text through without upload guidance when no files are attached", () => {
  const input = requirements();
  expect(applyBriefSectionGuidance(input)).toBe(
    [
      input.main.instructions,
      input.music.instructions,
      input.images.instructions,
      input.urls.instructions,
    ].join("\n"),
  );
  expect(applyBriefSectionGuidance(undefined)).toBe("");
});
it.each(["main", "music", "images"] as const)(
  "adds guidance only for uploads assigned to %s",
  (section) => {
    const input = requirements();
    input[section].assetIds = ["11111111-1111-4111-8111-111111111111"];
    const before = JSON.stringify(input);
    const prompt = applyBriefSectionGuidance(input);
    for (const [key, title] of [
      ["main", "DOCUMENTS"],
      ["music", "AUDIO"],
      ["images", "IMAGES"],
    ] as const)
      expect(prompt.includes(`UPLOADED ${title}:`)).toBe(key === section);
    expect(prompt).toContain(input[section].instructions);
    if (section === "images") expect(prompt).toContain("vendor/pica.min.js");
    expect(JSON.stringify(input)).toBe(before);
  },
);
it("omits music instructions and audio upload guidance from silent previews", () => {
  const input = requirements();
  input.music.assetIds = ["11111111-1111-4111-8111-111111111111"];
  const prompt = applyBriefSectionGuidance(input, { includeMusic: false });
  expect(prompt).not.toContain(input.music.instructions);
  expect(prompt).not.toContain("UPLOADED AUDIO:");
  expect(prompt).toContain(input.images.instructions);
});

it("keeps document identity internal during preparation and production, including silent previews", () => {
  const input = requirements();
  input.main.instructions = "Read the attached architecture-notes.md for the product facts.";
  input.main.assetIds = ["11111111-1111-4111-8111-111111111111"];
  const before = JSON.stringify(input);
  for (const prompt of [
    briefAttachmentInstructions,
    applyBriefSectionGuidance(input),
    applyBriefSectionGuidance(input, { includeMusic: false }),
  ]) {
    expect(prompt).toContain(documentContentGuidance);
    expect(prompt).toContain(
      "document names, document titles, filenames, file paths and attachment labels",
    );
    expect(prompt).toContain("visible text, graphics, captions, narration and lyrics");
    expect(prompt).toContain("unless the user explicitly asks to show or speak them");
    expect(prompt).toContain(
      "Naming an attachment in source-reading instructions is not a request to display its name",
    );
    expect(prompt).toContain("internal assetDescriptions and provenance records only");
    expect(prompt).toContain("preserve substantive facts, product names and user-requested copy");
  }
  expect(briefAttachmentInstructions).toContain(
    "identifying its original display name and asset path",
  );
  expect(JSON.stringify(input)).toBe(before);
});

it("applies the URL setting's guidance only when URLs are supplied", () => {
  const input = requirements();
  expect(applyBriefSectionGuidance(input)).not.toContain("SUPPLIED WEBSITES:");
  expect(applyBriefSectionGuidance(input, { urls: [" "] })).not.toContain("SUPPLIED WEBSITES:");
  const prompt = applyBriefSectionGuidance(input, { urls: ["https://example.com"] });
  expect(prompt).toContain(input.urls.instructions);
  expect(prompt).toContain("SUPPLIED WEBSITES:");
  expect(prompt).not.toContain("UPLOADED AUDIO:");
  expect(applyBriefSectionGuidance(undefined, { urls: ["https://example.com"] })).toContain(
    "SUPPLIED WEBSITES:",
  );
});
