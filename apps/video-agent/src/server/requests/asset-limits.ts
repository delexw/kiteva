import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { z } from "zod";
import type { Asset } from "../../shared/contracts";
import { assetLimitKind, assetLimits, validateAssetLimits } from "../../shared/asset-limits";
import { CodedError } from "../../shared/errors";
import { extractAssetText } from "./inputs";
import { command } from "../runtime/process";

export async function inspectAssetLimits(asset: Asset, buffer?: Buffer) {
  const kind = assetLimitKind(asset.name);
  validateAssetLimits([asset]);
  try {
    if (kind === "audio") {
      const result = z
        .object({ format: z.object({ duration: z.coerce.number().finite().positive() }) })
        .parse(
          JSON.parse(
            await command(
              "ffprobe",
              [
                "-v",
                "error",
                "-protocol_whitelist",
                "file,pipe",
                "-show_entries",
                "format=duration",
                "-of",
                "json",
                asset.path,
              ],
              path.dirname(asset.path),
              AbortSignal.timeout(15_000),
              undefined,
              15_000,
            ),
          ),
        );
      asset.durationSeconds = result.format.duration;
    } else if (/\.pdf$/i.test(asset.name)) {
      const pdf = new PDFParse({ data: buffer ?? (await readFile(asset.path)) });
      try {
        asset.documentPages = (await pdf.getInfo()).total;
      } finally {
        await pdf.destroy();
      }
    } else if (/\.(txt|md|json|csv|docx)$/i.test(asset.name)) {
      const text = await extractAssetText(asset, buffer);
      let words = 0;
      for (const word of new Intl.Segmenter("en", { granularity: "word" }).segment(text ?? "")) {
        if (word.isWordLike) words++;
        if (words > assetLimits.documents.pages * assetLimits.documents.wordsPerPage) break;
      }
      asset.documentPages = Math.ceil(words / assetLimits.documents.wordsPerPage);
    }
  } catch (error) {
    if (error instanceof CodedError) throw error;
    throw new CodedError("FILE_UNREADABLE", "Could not verify attachment duration or page count");
  }
  validateAssetLimits([asset]);
  return asset;
}
export async function validateProjectAssetLimits(
  ids: string[],
  getAsset: (id: string) => Asset | undefined,
) {
  if (new Set(ids).size !== ids.length)
    throw new CodedError("INVALID_REQUEST", "Duplicate attachment IDs");
  const assets = ids.map((id) => {
    const asset = getAsset(id);
    if (!asset) throw new CodedError("FILE_UNREADABLE", "Attachment not found");
    return { ...asset };
  });
  validateAssetLimits(assets);
  for (const asset of assets)
    if (
      (assetLimitKind(asset.name) === "audio" && asset.durationSeconds === undefined) ||
      (/\.(pdf|txt|md|json|csv|docx)$/i.test(asset.name) && asset.documentPages === undefined)
    )
      await inspectAssetLimits(asset);
  validateAssetLimits(assets);
  return assets;
}
