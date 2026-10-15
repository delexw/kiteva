import {
  roomWallpaperPreset,
  type RoomAppearance,
  type RoomWallpaperPreset,
} from "../../shared/room-appearance";

export function roomWallpaperImageUrl(id: string) {
  return `/api/room/wallpapers/${encodeURIComponent(id)}/file`;
}
export function roomWallpaperThumbnailUrl(id: string) {
  return `/api/assets/${encodeURIComponent(id)}/preview`;
}
export function roomPresetVariables(preset: RoomWallpaperPreset) {
  return {
    "--wallpaper-base": preset.colors.base,
    "--wallpaper-deep": preset.colors.deep,
    "--wallpaper-glow": preset.colors.glow,
    "--wallpaper-bloom": preset.colors.bloom,
    "--wallpaper-haze": preset.colors.haze,
  };
}
export function roomWallpaper(appearance: RoomAppearance) {
  const preset = roomWallpaperPreset(appearance.preset);
  const image = appearance.source === "image" && appearance.imageId;
  const id = image ? "image" : preset.id;
  return {
    id,
    variables: {
      ...roomPresetVariables(image ? roomWallpaperPreset("charcoal") : preset),
      "--wallpaper-image": image ? `url("${roomWallpaperImageUrl(image)}")` : "none",
      "--wallpaper-fit": appearance.fit,
      "--wallpaper-blur": image ? `${appearance.blur}px` : "0px",
      "--wallpaper-dim": id === "charcoal" ? "0" : String(appearance.dim),
    },
  };
}
