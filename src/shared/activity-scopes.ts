import { z } from "zod";

export const ActivityScopeSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().min(1).optional(),
  label: z.string().min(1),
  state: z.enum(["running", "complete", "failed", "stopped", "waiting"]),
});
export type ActivityScope = z.infer<typeof ActivityScopeSchema>;
