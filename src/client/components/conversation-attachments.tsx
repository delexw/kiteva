import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { RoomFileCard } from "../room/room-file-card";
import type { RoomLibraryAsset } from "../../shared/room";
import { translateUi, useUiLanguage } from "../i18n";
import "./conversation-attachments.css";

type ConversationAsset = Pick<RoomLibraryAsset, "id" | "originalName"> &
  Partial<Pick<RoomLibraryAsset, "bytes" | "durationSeconds" | "documentPages">>;

export function useConversationAttachments(runId: string, assetIds: string[]) {
  const [loaded, setLoaded] = useState<{ runId: string; assets: ConversationAsset[] }>();
  const ids = JSON.stringify(assetIds);
  useEffect(() => {
    if (ids === "[]") return;
    const controller = new AbortController();
    void api<{ assets: ConversationAsset[] }>(`/api/runs/${runId}/assets`, {
      signal: controller.signal,
    })
      .then(({ assets }) => {
        if (!controller.signal.aborted) setLoaded({ runId, assets });
      })
      .catch(() => {
        // Keep saved attachment IDs visible if their metadata cannot be loaded.
      });
    return () => controller.abort();
  }, [runId, ids]);
  return loaded?.runId === runId ? loaded.assets : [];
}

/** Saved references, including documents and media, rather than composer-only files. */
export function ConversationAttachments({
  assetIds,
  assets,
}: {
  assetIds: string[];
  assets: ConversationAsset[];
}) {
  useUiLanguage();
  if (!assetIds.length) return null;
  return (
    <div className="conversation-attachments" aria-label={translateUi("Attachments")}>
      {[...new Set(assetIds)].map((id) => {
        const asset = assets.find((item) => item.id === id);
        const name = asset?.originalName || `${translateUi("Attachments")} · ${id}`;
        return (
          <div key={id} title={name}>
            <RoomFileCard
              type="file"
              imagePreview
              asset={{
                id,
                originalName: name,
                kind: "",
                bytes: asset?.bytes || 0,
                durationSeconds: asset?.durationSeconds,
                documentPages: asset?.documentPages,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
