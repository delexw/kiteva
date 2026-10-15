import { acceptsBriefAttachment } from "../../shared/brief-sections";
import type { Asset, CreativeRequest } from "../../shared/contracts";
import { CodedError } from "../../shared/errors";

export function validateBriefSections(
  request: CreativeRequest,
  getAsset: (id: string) => Asset | undefined,
) {
  if (!request.requirements) return; // Existing saved requests retain their original attachment contract.
  const assigned = new Set<string>();
  for (const section of ["main", "music", "images"] as const) {
    for (const id of request.requirements[section].assetIds) {
      if (assigned.has(id) || !request.assetIds.includes(id))
        throw new CodedError(
          "INVALID_REQUEST",
          "Each attachment must belong to exactly one brief section",
        );
      const asset = getAsset(id);
      if (!asset) throw new CodedError("FILE_UNREADABLE", "Attached asset not found");
      if (!acceptsBriefAttachment(section, asset.name))
        throw new CodedError(
          "FILE_TYPE_UNSUPPORTED",
          "Unsupported attachment for this brief section",
        );
      assigned.add(id);
    }
  }
  if (assigned.size !== new Set(request.assetIds).size || assigned.size !== request.assetIds.length)
    throw new CodedError(
      "INVALID_REQUEST",
      "Every attachment must be assigned to one brief section",
    );
}
