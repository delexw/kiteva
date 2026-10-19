import { z } from "zod";

const ZoomRegionSchema = z
  .object({
    startSeconds: z.number().min(0).max(120),
    endSeconds: z.number().positive().max(120),
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

/** Shared tool, local recorder and worker contract; only native OpenScreen presentation controls. */
export const CapturePresentationSchema = z
  .object({
    framing: z
      .object({
        padding: z.number().min(0).max(100).optional(),
        borderRadius: z.number().min(0).max(64).optional(),
        shadowIntensity: z.number().min(0).max(1).optional(),
        backgroundBlur: z.number().min(0).max(1).optional(),
        motionBlurAmount: z.number().min(0).max(1).optional(),
        aspectRatio: z
          .enum(["native", "auto", "16:9", "9:16", "1:1", "4:3", "4:5", "16:10", "10:16"])
          .optional(),
      })
      .strict()
      .optional()
      .describe(
        "Choose the recording's framing for this project: padding 0 for edge-to-edge, or positive padding with roundness/shadow for an inset frame. Omitted fields use OpenScreen defaults; Kiteva does not force full-size framing.",
      ),
    zoomRegions: z
      .array(ZoomRegionSchema)
      .max(20)
      .refine(
        (regions) =>
          regions.every(
            (region, index) => index === 0 || region.startSeconds >= regions[index - 1].endSeconds,
          ),
        "Zoom regions must be in time order without overlaps",
      )
      .default([])
      .describe(
        "Optional zoom regions in ORIGINAL recording seconds, before idle cuts. Focus follows the cursor by default. Manual focus must be explicit; its coordinates are normalized to the full recorded window. Native auto-zoom avoids these regions.",
      ),
    cursorSize: z.number().min(1.5).max(6).optional(),
    cursorSmoothing: z.number().min(0).max(1).optional(),
    cursorMotionBlur: z.number().min(0).max(1).optional(),
    cursorClickBounce: z.number().min(0).max(2.5).optional(),
    cursorClickImpact: z
      .boolean()
      .optional()
      .describe(
        "Also push the recorded screen back on each click; choose deliberately for the project's motion language.",
      ),
  })
  .strict();
export type CapturePresentationInput = z.input<typeof CapturePresentationSchema>;

/** Fixed product appearance; the agent controls pacing and framing, not the cursor identity. */
export const captureCursorAppearance = {
  cursorTheme: "prism-glow",
  cursorModel3d: true,
  cursorAlwaysArrow: false,
  cursorAsArrow: ["text"] as Array<"text">,
} as const;

/** Recording provenance also accepts the appearances used by earlier saved takes. */
export const AppliedCapturePresentationSchema = CapturePresentationSchema.extend({
  // Earlier saved custom regions were exported as manual before focusMode was exposed.
  zoomRegions: z
    .array(ZoomRegionSchema.safeExtend({ focusMode: z.enum(["auto", "manual"]).default("manual") }))
    .default([]),
  cursorTheme: z.enum([
    "default",
    "studio-ink",
    "prism-glow",
    "pop-coral",
    "pixel-candy",
    "star-sprout",
    "glass-lens",
  ]),
  cursorModel3d: z.boolean().default(false),
  cursorAlwaysArrow: z.boolean().default(true),
  cursorAsArrow: z.array(z.literal("text")).optional(),
});
