import { z } from "zod";
export const CommandCaptureSchema = z.object({
  command: z.array(z.string()).min(1),
  cwd: z.string(),
  stdout: z.string(),
  stderr: z.string(),
});
