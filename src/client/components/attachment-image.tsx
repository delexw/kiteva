import { Image } from "antd";

/** One image preview implementation for saved references throughout the conversation. */
export function AttachmentImage({
  assetId,
  label,
  size = 96,
  preview = true,
}: {
  assetId: string;
  label: string;
  size?: number;
  preview?: boolean;
}) {
  return (
    <Image
      src={`/api/assets/${encodeURIComponent(assetId)}/preview`}
      width={size}
      height={size}
      alt={label}
      preview={preview}
      style={{ objectFit: "contain", borderRadius: 6 }}
    />
  );
}
