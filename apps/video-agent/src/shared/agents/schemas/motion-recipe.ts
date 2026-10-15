import { z } from "zod";
export const MotionRecipeSchema = z.object({
  styleId: z.string().regex(/^style-\d{3}$/),
  action: z.enum([
    "assemble",
    "draw",
    "float",
    "orbit",
    "pulse",
    "wave",
    "step",
    "type",
    "jitter",
    "scan",
  ]),
  amplitude: z.number().min(0.5).max(2),
  direction: z.enum(["horizontal", "vertical", "radial"]),
  rationale: z.string().max(600),
});
export const MotionRecipesSchema = z.object({
  recipes: z.array(MotionRecipeSchema).min(1).max(115),
});
export type MotionRecipe = z.infer<typeof MotionRecipeSchema>;
