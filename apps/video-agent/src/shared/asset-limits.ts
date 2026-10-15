import { CodedError } from "./errors";
export const assetLimits = {
  images: { count: 8, bytes: 10_000_000 },
  audio: { count: 2, bytes: 25_000_000, seconds: 600 },
  documents: { count: 3, bytes: 10_000_000, pages: 30, wordsPerPage: 500 },
  total: { count: 12, bytes: 100_000_000 },
} as const;
export interface LimitedAsset {
  name: string;
  bytes: number;
  durationSeconds?: number;
  documentPages?: number;
}
export function assetLimitKind(name: string) {
  if (/\.(png|jpe?g|webp|gif|svg)$/i.test(name)) return "images";
  if (/\.(wav|mp3|m4a)$/i.test(name)) return "audio";
  return "documents";
}
export function hasReachedAssetCountLimit(
  names: readonly string[],
  kind: ReturnType<typeof assetLimitKind>,
) {
  return (
    names.length >= assetLimits.total.count ||
    names.filter((name) => assetLimitKind(name) === kind).length >= assetLimits[kind].count
  );
}
export function validateAssetLimits(assets: readonly LimitedAsset[]) {
  if (assets.length > assetLimits.total.count)
    throw new CodedError("TOO_MANY_ATTACHMENTS", "Use at most 12 attachments per project");
  let total = 0,
    pages = 0;
  const counts = { images: 0, audio: 0, documents: 0 };
  for (const asset of assets) {
    const kind = assetLimitKind(asset.name);
    counts[kind]++;
    if (!Number.isFinite(asset.bytes) || asset.bytes < 0)
      throw new CodedError("FILE_UNREADABLE", "Invalid file size");
    if (asset.bytes > assetLimits[kind].bytes)
      throw new CodedError(
        "FILE_TOO_LARGE",
        `${kind === "audio" ? "Audio: 25" : "Images and documents: 10"} MB per file`,
      );
    total += asset.bytes;
    if (
      kind === "audio" &&
      asset.durationSeconds !== undefined &&
      (!Number.isFinite(asset.durationSeconds) ||
        asset.durationSeconds <= 0 ||
        asset.durationSeconds > assetLimits.audio.seconds)
    )
      throw new CodedError("AUDIO_TOO_LONG", "Audio must be at most 10 minutes");
    if (asset.documentPages !== undefined) {
      if (!Number.isFinite(asset.documentPages) || asset.documentPages < 0)
        throw new CodedError("FILE_UNREADABLE", "Invalid document page count");
      pages += asset.documentPages;
    }
  }
  if (counts.images > assetLimits.images.count)
    throw new CodedError("TOO_MANY_IMAGES", "Use at most 8 images");
  if (counts.audio > assetLimits.audio.count)
    throw new CodedError("TOO_MANY_AUDIO", "Use at most 2 audio files");
  if (counts.documents > assetLimits.documents.count)
    throw new CodedError("TOO_MANY_DOCUMENTS", "Use at most 3 other files");
  if (total > assetLimits.total.bytes)
    throw new CodedError("ASSETS_TOO_LARGE", "Attachments must total at most 100 MB");
  if (pages > assetLimits.documents.pages)
    throw new CodedError("DOCUMENT_TOO_LONG", "Documents must total at most 30 pages");
}
export const assetLimitHelp = {
  main: "Up to 3 documents · 10 MB each · 30 pages combined (text: 500 words/page)",
  music: "Up to 2 audio files · 25 MB and 10 minutes each",
  images: "Up to 8 images · 10 MB each",
  total: "All references are optional · up to 12 files and 100 MB total",
};
