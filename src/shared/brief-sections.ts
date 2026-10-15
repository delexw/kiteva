import { z } from "zod";

export const briefSectionNames = ["main", "music", "images", "urls"] as const;
export type BriefSectionName = (typeof briefSectionNames)[number];
const RequirementSchema = z.object({
  instructions: z.string().trim().max(8000).default(""),
  assetIds: z.array(z.string().uuid()).max(20).default([]),
});
export const BriefRequirementsSchema = z.object({
  main: RequirementSchema,
  music: RequirementSchema,
  images: RequirementSchema,
  urls: z.object({ instructions: z.string().trim().max(8000).default("") }),
});
export type BriefRequirements = z.infer<typeof BriefRequirementsSchema>;
export const briefSectionFileAccept = {
  main: ".md,.txt,.pdf",
  music: ".wav,.mp3,.m4a",
  images: ".png,.jpg,.jpeg,.webp,.gif,.svg",
};
export function acceptsBriefAttachment(section: Exclude<BriefSectionName, "urls">, name: string) {
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  return briefSectionFileAccept[section].split(",").includes(extension);
}
