import { useEffect, useState, type CSSProperties } from "react";
import {
  Alert,
  Button,
  Drawer,
  Radio,
  Segmented,
  Slider,
  Upload,
  type SliderSingleProps,
} from "antd";
import { ImagePlus, Trash2 } from "lucide-react";
import {
  defaultRoomAppearance,
  roomWallpaperExtensions,
  roomWallpaperLimits,
  roomWallpaperPresets,
  type RoomAppearance,
  type RoomWallpaperMood,
  type RoomWallpaperPresetId,
} from "../../shared/room-appearance";
import type { RoomLibraryAsset } from "../../shared/room";
import { validateAssetLimits } from "../../shared/asset-limits";
import { api } from "../lib/api";
import { roomCssVariables } from "../theme";
import { roomPresetVariables, roomWallpaperThumbnailUrl } from "./wallpapers";

const moods: Array<{ mood: RoomWallpaperMood; title: string }> = [
  { mood: "warm", title: "Warm & sweet" },
  { mood: "cool", title: "Cool & sweet" },
  { mood: "original", title: "Original" },
];
const imageValue = (id: string) => `image:${id}`;
const percent = (value?: number) => `${Math.round((value || 0) * 100)}%`;

export function RoomAppearanceSlider({
  id,
  caption,
  ...slider
}: SliderSingleProps & { id: string; caption: string }) {
  return (
    <div className="room-appearance-field">
      <span id={id}>{caption}</span>
      <Slider {...slider} ariaLabelledByForHandle={id} />
    </div>
  );
}

export function RoomAppearanceDrawer({
  open,
  onClose,
  appearance,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  appearance: RoomAppearance;
  onChange: (change: Partial<RoomAppearance>) => void;
}) {
  const [images, setImages] = useState<RoomLibraryAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    api<RoomLibraryAsset[]>("/api/room/wallpapers")
      .then(setImages)
      .catch((e) => setError(`Could not load your images: ${(e as Error).message}`));
  }, [open]);
  const image = appearance.source === "image" ? appearance.imageId : undefined;
  const value = image ? imageValue(image) : appearance.preset;
  const choose = (next: string) =>
    onChange(
      next.startsWith("image:")
        ? { source: "image", imageId: next.slice(imageValue("").length) }
        : { source: "preset", preset: next as RoomWallpaperPresetId },
    );
  async function upload(file: File) {
    setError("");
    try {
      const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!roomWallpaperExtensions.includes(extension))
        throw new Error("Use a PNG, JPG or WebP image");
      validateAssetLimits([{ name: file.name, bytes: file.size }]);
      setUploading(true);
      const form = new FormData();
      form.append("file", file);
      const asset = await api<RoomLibraryAsset>("/api/room/wallpapers", {
        method: "POST",
        body: form,
      });
      setImages((previous) => [asset, ...previous.filter((item) => item.id !== asset.id)]);
      onChange({ source: "image", imageId: asset.id });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function remove(asset: RoomLibraryAsset) {
    setError("");
    try {
      await api(`/api/room/wallpapers/${asset.id}`, { method: "DELETE" });
      setImages((previous) => previous.filter((item) => item.id !== asset.id));
      if (appearance.imageId === asset.id) onChange({ source: "preset", imageId: undefined });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Drawer
      title="Desktop appearance"
      open={open}
      onClose={onClose}
      mask={{ enabled: true, blur: false, closable: true }}
      size="min(400px, 100vw)"
      rootClassName="room-appearance"
      styles={{ root: roomCssVariables as CSSProperties, mask: { background: "transparent" } }}
    >
      <div className="room-appearance-body">
        {moods.map(({ mood, title }) => (
          <section key={mood} aria-labelledby={`room-wallpaper-${mood}`}>
            <h3 id={`room-wallpaper-${mood}`}>{title}</h3>
            <Radio.Group
              name="room-wallpaper"
              value={value}
              onChange={(event) => choose(event.target.value)}
              className="room-wallpaper-options"
            >
              {roomWallpaperPresets
                .filter((preset) => preset.mood === mood)
                .map((preset) => (
                  <Radio key={preset.id} value={preset.id} className="room-wallpaper-option">
                    <span
                      className="room-wallpaper-swatch"
                      data-wallpaper={preset.id}
                      style={roomPresetVariables(preset) as CSSProperties}
                      aria-hidden="true"
                    >
                      <span className="room-wallpaper-scene" />
                    </span>
                    <span className="room-wallpaper-option-text">
                      <strong>{preset.name}</strong>
                      <small>{preset.description}</small>
                    </span>
                  </Radio>
                ))}
            </Radio.Group>
          </section>
        ))}
        <section aria-labelledby="room-wallpaper-images">
          <h3 id="room-wallpaper-images">Your images</h3>
          <Upload
            accept={roomWallpaperExtensions.join(",")}
            showUploadList={false}
            beforeUpload={(file) => {
              void upload(file);
              return false;
            }}
          >
            <Button icon={<ImagePlus size={15} />} loading={uploading}>
              Choose an image…
            </Button>
          </Upload>
          <p className="room-hint">
            PNG, JPG or WebP up to 10 MB. It stays on this computer and is not added to your
            material shelf.
          </p>
          {images.length > 0 && (
            <Radio.Group
              name="room-wallpaper"
              value={value}
              onChange={(event) => choose(event.target.value)}
              className="room-wallpaper-options"
            >
              {images.map((asset) => (
                <div className="room-wallpaper-image-option" key={asset.id}>
                  <Radio value={imageValue(asset.id)} className="room-wallpaper-option">
                    <span className="room-wallpaper-swatch" aria-hidden="true">
                      <img src={roomWallpaperThumbnailUrl(asset.id)} alt="" />
                    </span>
                    <span className="room-wallpaper-option-text">
                      <strong>{asset.originalName}</strong>
                    </span>
                  </Radio>
                  <Button
                    type="text"
                    size="small"
                    aria-label={`Remove ${asset.originalName} from your images`}
                    icon={<Trash2 size={14} />}
                    onClick={() => void remove(asset)}
                  />
                </div>
              ))}
            </Radio.Group>
          )}
        </section>
        {error && (
          <Alert type="error" showIcon title={error} closable onClose={() => setError("")} />
        )}
        <section aria-labelledby="room-wallpaper-comfort" className="room-appearance-comfort">
          <h3 id="room-wallpaper-comfort">Keep windows easy to read</h3>
          {image && (
            <div className="room-appearance-field">
              <span id="room-wallpaper-fit">Image size</span>
              <Segmented<RoomAppearance["fit"]>
                aria-labelledby="room-wallpaper-fit"
                block
                value={appearance.fit}
                options={[
                  { value: "cover", label: "Fill the screen" },
                  { value: "contain", label: "Show the whole image" },
                ]}
                onChange={(fit) => onChange({ fit })}
              />
            </div>
          )}
          <RoomAppearanceSlider
            id="room-wallpaper-dim"
            caption={`Soften the background · ${percent(appearance.dim)}`}
            min={roomWallpaperLimits.dim.min}
            max={roomWallpaperLimits.dim.max}
            step={0.05}
            value={appearance.dim}
            disabled={!image && appearance.preset === "charcoal"}
            tooltip={{ formatter: percent }}
            onChange={(dim) => onChange({ dim })}
          />
          {image && (
            <RoomAppearanceSlider
              id="room-wallpaper-blur"
              caption={`Blur the image · ${appearance.blur}px`}
              min={roomWallpaperLimits.blur.min}
              max={roomWallpaperLimits.blur.max}
              step={1}
              value={appearance.blur}
              tooltip={{ formatter: (blur) => `${blur}px` }}
              onChange={(blur) => onChange({ blur })}
            />
          )}
        </section>
        <Button onClick={() => onChange({ ...defaultRoomAppearance, imageId: undefined })}>
          Restore original charcoal
        </Button>
      </div>
    </Drawer>
  );
}
