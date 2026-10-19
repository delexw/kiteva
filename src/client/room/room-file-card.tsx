import { translateUi, useUiLanguage } from "../i18n";
import { FileCard } from "@ant-design/x";
import { Button, Image } from "antd";
import { Trash2 } from "lucide-react";
import type { RoomLibraryAsset } from "../../shared/room";
import { roomMaterialSection } from "./onboarding";

function cardProps(asset: RoomLibraryAsset) {
  return {
    name: asset.originalName,
    byte: asset.bytes,
    size: "small" as const,
    ...(roomMaterialSection(asset.originalName) === "images"
      ? {
          type: "file" as const,
          className: "room-image-file-card",
          description: false,
          styles: {
            root: { width: "100%", minWidth: 0 },
            file: { width: "100%", height: 64, padding: 8 },
            icon: { width: 48, height: 48, flexShrink: 0 },
          },
          icon: (
            <Image
              src={`/api/assets/${asset.id}/preview`}
              width={48}
              height={48}
              preview={false}
              alt=""
              style={{ objectFit: "cover", borderRadius: 6 }}
            />
          ),
        }
      : {}),
  };
}

/** A shelf file that can be picked with a pointer or the keyboard (Enter or Space). */
export function RoomFilePick({
  asset,
  picked,
  onToggle,
  onDelete,
  deleting = false,
}: {
  asset: RoomLibraryAsset;
  picked: boolean;
  onToggle: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const pick = (
    <div
      className={picked ? "room-shelf-pick is-picked" : "room-shelf-pick"}
      role="button"
      tabIndex={0}
      aria-pressed={picked}
      aria-label={`${picked ? translateUi("Remove") : translateUi("Add")} ${asset.originalName}`}
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
  return onDelete ? (
    <div className="room-shelf-item">
      {pick}
      <Button
        className="room-shelf-delete"
        size="small"
        danger
        loading={deleting}
        aria-label={translateUi("Delete {{value0}} from shelf", { value0: asset.originalName })}
        title={translateUi("Delete from shelf")}
        icon={<Trash2 size={15} />}
        onClick={onDelete}
      />
    </div>
  ) : (
    pick
  );
}

/** A chosen file, with an optional labelled button to take it out again. */
export function RoomChosenFile({
  asset,
  onRemove,
  removing = false,
}: {
  asset: RoomLibraryAsset;
  onRemove?: () => void;
  removing?: boolean;
}) {
  useUiLanguage();
  return (
    <div className="room-chosen-file">
      <FileCard {...cardProps(asset)} />
      {onRemove && (
        <Button
          type="text"
          size="small"
          loading={removing}
          aria-label={translateUi("Remove {{value0}}", { value0: asset.originalName })}
          title={translateUi("Delete file")}
          icon={<Trash2 size={15} />}
          onClick={onRemove}
        />
      )}
    </div>
  );
}
export function RoomFileCard({ asset }: { asset: RoomLibraryAsset }) {
  useUiLanguage();
  return <FileCard {...cardProps(asset)} />;
}
