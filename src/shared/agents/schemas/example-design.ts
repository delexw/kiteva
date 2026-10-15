import { z } from "zod";
export const ExampleDesignSchema = z.object({
  examples: z
    .array(
      z.object({
        styleId: z.string().regex(/^style-\d{3}$/),
        svg: z.string().max(150000),
        designNotes: z.string().max(3000),
      }),
    )
    .min(1)
    .max(5),
});
export type ExampleDesign = z.infer<typeof ExampleDesignSchema>["examples"][number];
