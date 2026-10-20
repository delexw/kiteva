import { expect, it } from "vitest";
import { BriefRequirementsSchema } from "../src/shared/brief-sections";
import { applyBriefSectionGuidance } from "../src/server/requests/brief-section-guidance";

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
