import type { BriefRequirements } from "../../shared/brief-sections";
import { documentUploadGuidance } from "./section-prompts/documents";
import { imageUploadGuidance } from "./section-prompts/images";
import { musicUploadGuidance } from "./section-prompts/music";
import { websiteReferenceGuidance } from "./section-prompts/urls";

const sectionGuidance = {
  main: documentUploadGuidance,
  images: imageUploadGuidance,
  music: musicUploadGuidance,
  urls: websiteReferenceGuidance,
};

/** Apply each setting's own guidance only when it has supplied source material. */
export function applyBriefSectionGuidance(
  requirements: BriefRequirements | undefined,
  { includeMusic = true, urls = [] }: { includeMusic?: boolean; urls?: readonly string[] } = {},
) {
  return (["main", "music", "images", "urls"] as const)
    .filter((section) => includeMusic || section !== "music")
    .flatMap((section) => {
      const setting = requirements?.[section];
      const hasSources =
        section === "urls"
          ? urls.some((url) => url.trim().length > 0)
          : Boolean(setting && "assetIds" in setting && setting.assetIds.length);
      return [setting?.instructions || "", hasSources ? sectionGuidance[section] : ""];
    })
    .filter(Boolean)
    .join("\n");
}
