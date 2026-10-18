import { z } from "zod";

export const CaptureSessionSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(10),
  mode: z.enum(["local", "hosted"]),
});
export const CaptureActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("inspect"), url: z.string().url().optional() }),
  z.object({ action: z.literal("click"), controlId: z.string().regex(/^\d+$/) }),
  z.object({
    action: z.literal("fill"),
    controlId: z.string().regex(/^\d+$/),
    value: z.string().max(4000),
  }),
  z.object({ action: z.literal("scroll"), deltaY: z.number().min(-1800).max(1800) }),
  z.object({ action: z.literal("capture"), selector: z.string().max(500).optional() }),
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("stop"), recordingId: z.string().uuid() }),
]);
export type CaptureAction = z.infer<typeof CaptureActionSchema>;
export const WorkerAssetNameSchema = z
  .string()
  .regex(/^(website-(video|reference)-[0-9a-f-]{36})(\.webm|\.png|\.cursor\.json)$/);
