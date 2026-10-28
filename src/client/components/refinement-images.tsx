import { useEffect, useRef, useState } from "react";
import { Alert, Button, Upload } from "antd";
import { ImagePlus } from "lucide-react";
import { assetLimits } from "../../shared/asset-limits";
import type { Asset } from "../../shared/contracts";
import { api } from "../lib/api";
import { translateUi } from "../i18n";

type ImageAttachment = Pick<Asset, "id" | "name" | "originalName">;

/** Shared revision-only upload state for both refinement interfaces. */
export function useRefinementImages(runId: string, projectAssetIds: string[]) {
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const currentRun = useRef(runId);
  useEffect(() => {
    currentRun.current = runId;
    setImages([]);
    setError("");
  }, [runId]);
  async function add(files: File[]) {
    if (uploading) return;
    const targetRun = runId;
    setUploading(true);
    setError("");
    const added = [...images];
    try {
      if (added.length + files.length > assetLimits.images.count)
        throw Error(translateUi("Attach up to 8 refinement images."));
      for (const file of files) {
        const form = new FormData();
        form.append(
          "assetIds",
          JSON.stringify([...new Set([...projectAssetIds, ...added.map((image) => image.id)])]),
        );
        form.append("file", file);
        const image = await api<ImageAttachment>("/api/assets", { method: "POST", body: form });
        if (currentRun.current !== targetRun) return;
        added.push(image);
        setImages([...added]);
      }
    } catch (issue) {
      if (currentRun.current === targetRun) setError((issue as Error).message);
    } finally {
      setUploading(false);
    }
  }
  return {
    images,
    uploading,
    error,
    add,
    remove: (id: string) => setImages((items) => items.filter((image) => image.id !== id)),
    clear: () => setImages([]),
  };
}

export function RefinementImages({
  attachments,
  disabled,
}: {
  attachments: ReturnType<typeof useRefinementImages>;
  disabled: boolean;
}) {
  return (
    <div className="refinement-images">
      <Upload
        accept=".png,.jpg,.jpeg,.webp,.gif,.svg"
        multiple
        disabled={disabled || attachments.uploading}
        listType="picture"
        fileList={attachments.images.map((image) => ({
          uid: image.id,
          name: image.originalName || image.name,
          status: "done",
          thumbUrl: `/api/assets/${image.id}/preview`,
        }))}
        beforeUpload={(file, files) => {
          if (file === files[0]) void attachments.add(files);
          return Upload.LIST_IGNORE;
        }}
        onRemove={(file) => {
          attachments.remove(file.uid);
        }}
      >
        <Button
          type="text"
          icon={<ImagePlus size={18} />}
          aria-label={translateUi("Attach refinement images")}
          title={translateUi("Attach refinement images")}
          disabled={disabled || attachments.uploading}
          loading={attachments.uploading}
        />
      </Upload>
      {attachments.error && <Alert type="error" title={attachments.error} showIcon />}
    </div>
  );
}
