import { z } from "zod";

export const captureCursorThemes = [
  "default",
  "studio-ink",
  "prism-glow",
  "pop-coral",
  "pixel-candy",
  "star-sprout",
  "glass-lens",
] as const;

const ZoomRegionSchema = z
  .object({
    startSeconds: z.number().finite().min(0),
    endSeconds: z.number().finite().positive(),
    depth: z.number().int().min(1).max(6).describe("1=1.25x, 2=1.5x, 3=1.8x, 4=2.2x, 5=3.5x, 6=5x"),
    focusMode: z
      .enum(["auto", "manual"])
      .default("auto")
      .describe(
        "Auto follows the recorded cursor. Choose manual explicitly only to hold focus on a fixed point.",
      ),
    focusX: z.number().min(0).max(1).default(0.5),
    focusY: z.number().min(0).max(1).default(0.5),
  })
  .refine((region) => region.endSeconds > region.startSeconds, "Zoom end must follow start");

const CaptureFramingSchema = z
  .object({
    shadowIntensity: z.number().min(0).max(1).optional(),
    motionBlurAmount: z.number().min(0).max(1).optional(),
  })
  .strict();

/** Controls available to the model; fixed presentation policy is applied separately. */
export const CapturePresentationSchema = z
  .object({
    framing: CaptureFramingSchema.optional().describe(
      "Optional shadow and screen-motion blur. Other framing settings are fixed by Kiteva.",
    ),
    cursorTheme: z
      .enum(captureCursorThemes)
      .default("default")
      .describe(
        "Choose a 2D cursor theme to complement the idea's primary Motion Graphic, palette and tone while remaining visible over the app. Keep the same theme across related takes. Omission uses OpenScreen's default theme; 3D is disabled.",
      ),
    cursorMotionBlur: z.number().min(0).max(1).optional(),
  })
  .strict();
export type CapturePresentationInput = z.input<typeof CapturePresentationSchema>;

/** Shared 2D cursor behavior; theme selection belongs to the capture tool caller. */
export const captureCursorAppearance = {
  cursorClickBounce: 2,
  cursorClickImpact: false,
  cursorSize: 1.5,
  cursorSmoothing: 0,
  cursorModel3d: false,
  cursorAlwaysArrow: false,
  cursorAsArrow: ["text"] as Array<"text">,
} as const;

/** Fixed frame appearance, shared by local capture, workers and provenance. */
export const captureFramingAppearance = {
  padding: 24,
  borderRadius: 0,
  backgroundBlur: 1,
  aspectRatio: "16:9",
} as const;

export function resolveCapturePresentation(input: CapturePresentationInput = {}) {
  return {
    ...input,
    cursorTheme: input.cursorTheme ?? captureCursorThemes[0],
    ...captureCursorAppearance,
    framing: { ...input.framing, ...captureFramingAppearance },
  };
}

/** Recording provenance also accepts the appearances used by earlier saved takes. */
export const AppliedCapturePresentationSchema = CapturePresentationSchema.extend({
  framing: CaptureFramingSchema.extend({
    padding: z.number().min(0).max(100).optional(),
    borderRadius: z.number().min(0).max(64).optional(),
    backgroundBlur: z.number().min(0).max(1).optional(),
    aspectRatio: z
      .enum(["native", "auto", "16:9", "9:16", "1:1", "4:3", "4:5", "16:10", "10:16"])
      .optional(),
  }).optional(),
  cursorClickImpact: z.boolean().optional(),
  // Older takes may contain the previous native cursor size range.
  cursorSize: z.number().min(1.5).max(6).optional(),
  // Preserve the actual settings of older takes; new captures always disable smoothing.
  cursorSmoothing: z.number().min(0).max(1).optional(),
  // The previous CLI export path accepted 2.5; retain saved recording metadata.
  cursorClickBounce: z.number().min(0).max(2.5).optional(),
  // Earlier saved custom regions were exported as manual before focusMode was exposed.
  zoomRegions: z
    .array(ZoomRegionSchema.safeExtend({ focusMode: z.enum(["auto", "manual"]).default("manual") }))
    .optional(),
  cursorModel3d: z.boolean().default(false),
  cursorAlwaysArrow: z.boolean().default(true),
  cursorAsArrow: z.array(z.literal("text")).optional(),
});
