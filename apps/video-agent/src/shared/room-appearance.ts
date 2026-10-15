import { z } from "zod";
import { briefSectionFileAccept } from "./brief-sections";

export type RoomWallpaperMood = "original" | "warm" | "cool";
export interface RoomWallpaperPreset {
  id: string;
  name: string;
  mood: RoomWallpaperMood;
  description: string;
  colors: { base: string; deep: string; glow: string; bloom: string; haze: string };
}

export const roomWallpaperPresets = [
  {
    id: "charcoal",
    name: "Original charcoal",
    mood: "original",
    description: "The room’s quiet warm black",
    colors: {
      base: "#1b1714",
      deep: "#0f0d0b",
      glow: "#3b2a1c",
      bloom: "#2c2017",
      haze: "#d9823b",
    },
  },
  {
    id: "peach-dusk",
    name: "Peach dusk",
    mood: "warm",
    description: "Apricot light sinking into plum",
    colors: {
      base: "#3a2430",
      deep: "#1a1216",
      glow: "#e89a74",
      bloom: "#b8656f",
      haze: "#f3c49a",
    },
  },
  {
    id: "rose-clay",
    name: "Rose clay",
    mood: "warm",
    description: "Dusty rose folded over terracotta",
    colors: {
      base: "#33201d",
      deep: "#170f0e",
      glow: "#d38a7e",
      bloom: "#9c5248",
      haze: "#ecb7a6",
    },
  },
  {
    id: "honey-haze",
    name: "Honey haze",
    mood: "warm",
    description: "Amber glow through soft linen",
    colors: {
      base: "#2f2417",
      deep: "#15100a",
      glow: "#e2b06c",
      bloom: "#a8703f",
      haze: "#f1d3a1",
    },
  },
  {
    id: "lilac-mist",
    name: "Lilac mist",
    mood: "cool",
    description: "Lavender haze over twilight blue",
    colors: {
      base: "#24213a",
      deep: "#110f1c",
      glow: "#b29fdc",
      bloom: "#6f64a8",
      haze: "#e2c9e8",
    },
  },
  {
    id: "soft-glacier",
    name: "Soft glacier",
    mood: "cool",
    description: "Pale ice blue resting on slate",
    colors: {
      base: "#18252f",
      deep: "#0b1218",
      glow: "#9cc4dc",
      bloom: "#5a809f",
      haze: "#e0d5ea",
    },
  },
  {
    id: "sea-glass",
    name: "Sea glass",
    mood: "cool",
    description: "Frosted mint drifting into teal",
    colors: {
      base: "#152728",
      deep: "#0a1314",
      glow: "#9ad1bf",
      bloom: "#4b8784",
      haze: "#d9e6c8",
    },
  },
] as const satisfies readonly RoomWallpaperPreset[];

export type RoomWallpaperPresetId = (typeof roomWallpaperPresets)[number]["id"];
const presetIds = roomWallpaperPresets.map((preset) => preset.id) as [
  RoomWallpaperPresetId,
  ...RoomWallpaperPresetId[],
];
export const roomWallpaperFits = ["cover", "contain"] as const;
export const roomWallpaperLimits = { dim: { min: 0, max: 0.7 }, blur: { min: 0, max: 16 } };
export const roomWallpaperExtensions = briefSectionFileAccept.images
  .split(",")
  .filter((extension) => ![".svg", ".gif"].includes(extension));

const clamp = (min: number, max: number) => (value: number) => Math.min(max, Math.max(min, value));
const RoomAppearanceShape = z.object({
  source: z.enum(["preset", "image"]).catch("preset"),
  preset: z.enum(presetIds).catch("charcoal"),
  imageId: z.string().min(1).max(120).optional().catch(undefined),
  fit: z.enum(roomWallpaperFits).catch("cover"),
  dim: z
    .number()
    .finite()
    .transform(clamp(roomWallpaperLimits.dim.min, roomWallpaperLimits.dim.max))
    .catch(0.25),
  blur: z
    .number()
    .finite()
    .transform(clamp(roomWallpaperLimits.blur.min, roomWallpaperLimits.blur.max))
    .catch(0),
});
export const RoomAppearanceSchema = RoomAppearanceShape.transform((appearance) =>
  appearance.source === "image" && !appearance.imageId
    ? { ...appearance, source: "preset" as const }
    : appearance,
);
export type RoomAppearance = z.infer<typeof RoomAppearanceSchema>;
export const defaultRoomAppearance: RoomAppearance = RoomAppearanceSchema.parse({});

export function roomWallpaperPreset(id: string) {
  return roomWallpaperPresets.find((preset) => preset.id === id) || roomWallpaperPresets[0];
}
export function changeRoomAppearance(
  current: RoomAppearance,
  change: Partial<RoomAppearance>,
): RoomAppearance {
  return RoomAppearanceSchema.parse({ ...current, ...change });
}
