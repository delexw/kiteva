import { FileCard } from "@ant-design/x";
import { Button } from "antd";
import { X } from "lucide-react";
import type { RoomLibraryAsset } from "../../shared/room";
import { roomMaterialSection } from "./onboarding";

function cardProps(asset: RoomLibraryAsset) {
  return {
    name: asset.originalName,
    byte: asset.bytes,
    size: "small" as const,
    ...(roomMaterialSection(asset.originalName) === "images"
      ? {
          src: `/api/assets/${asset.id}/preview`,
          imageProps: { preview: false, alt: "" },
        }
      : {}),
  };
}

/** A shelf file that can be picked with a pointer or the keyboard (Enter or Space). */
export function RoomFilePick({
  asset,
  picked,
  onToggle,
}: {
  asset: RoomLibraryAsset;
  picked: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={picked ? "room-shelf-pick is-picked" : "room-shelf-pick"}
      role="button"
      tabIndex={0}
      aria-pressed={picked}
      aria-label={`${picked ? "Remove" : "Add"} ${asset.originalName}`}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onToggle();
      }}
    >
      <FileCard {...cardProps(asset)} />
    </div>
  );
}

/** A chosen file, with an optional labelled button to take it out again. */
export function RoomChosenFile({
  asset,
  onRemove,
}: {
  asset: RoomLibraryAsset;
  onRemove?: () => void;
}) {
  return (
    <div className="room-chosen-file">
      <FileCard {...cardProps(asset)} />
      {onRemove && (
        <Button
          type="text"
          size="small"
          aria-label={`Remove ${asset.originalName}`}
          icon={<X size={14} />}
          onClick={onRemove}
        />
      )}
    </div>
  );
}
export function RoomFileCard({ asset }: { asset: RoomLibraryAsset }) {
  return <FileCard {...cardProps(asset)} />;
}
