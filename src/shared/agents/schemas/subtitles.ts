import { z } from "zod";
export const SubtitlesTextSchema = z.object({ text: z.string().trim().min(1).max(8000) });
