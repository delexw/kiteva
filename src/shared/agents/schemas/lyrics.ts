import { z } from "zod";
export const LyricsTextSchema = z.object({ text: z.string().trim().min(1).max(8000) });
