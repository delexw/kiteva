import { z } from "zod";
import { SpeechSettingsSchema, type SpeechSettings, speechLanguage } from "./speech";

const NarrationItemSpeechSchema = SpeechSettingsSchema.options[1]
  .omit({
    source: true,
    text: true,
    instructions: true,
    startSeconds: true,
    followVideoLanguage: true,
  })
  .superRefine((settings, context) => {
    const result = SpeechSettingsSchema.safeParse(settings);
    if (!result.success)
      for (const issue of result.error.issues)
        context.addIssue({ code: "custom", path: issue.path, message: issue.message });
  });
const ItemSpeechSchema = z.union([z.object({ mode: z.literal("off") }), NarrationItemSpeechSchema]);
export const ScriptItemSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-zA-Z0-9_-]+$/),
    startSeconds: z.number().finite().min(0).max(300),
    endSeconds: z.number().finite().positive().max(300),
    source: z.enum(["provided", "write"]).optional(),
    text: z.string().trim().min(1).max(8000),
    showSubtitles: z.boolean(),
    speech: ItemSpeechSchema,
  })
  .refine((item) => item.endSeconds > item.startSeconds, "An item's end must follow its start.");
export const ScriptItemDraftSchema = z.object({
  ...ScriptItemSchema.shape,
  startSeconds: z.number().finite(),
  endSeconds: z.number().finite(),
  text: z.string().max(8000),
});
export const ScriptItemsSchema = z
  .array(ScriptItemSchema)
  .max(80)
  .superRefine((items, context) => {
    const ids = new Set<string>();
    const spoken = items
      .filter((item) => item.speech.mode === "narration")
      .sort((a, b) => a.startSeconds - b.startSeconds);
    items.forEach((item, index) => {
      if (ids.has(item.id))
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Script item IDs must be unique.",
        });
      ids.add(item.id);
    });
    spoken.forEach((item, index) => {
      if (index && item.startSeconds < spoken[index - 1].endSeconds)
        context.addIssue({ code: "custom", message: "Spoken script items must not overlap." });
    });
  });
export type ScriptItem = z.infer<typeof ScriptItemSchema>;
export function scriptItemsProblem(items: ScriptItem[] | undefined, duration?: number | "auto") {
  if (items === undefined) return undefined;
  const parsed = ScriptItemsSchema.safeParse(items);
  if (!parsed.success) return parsed.error.issues.map((issue) => issue.message).join(" ");
  if (typeof duration === "number" && items.some((item) => item.endSeconds > duration))
    return "Every script item must end within the film duration.";
  return undefined;
}
/** Explicit conversion only: keep existing drafts on their legacy editor until requested. */
export function legacyScriptItems(request: {
  duration?: number | "auto";
  subtitles?: { mode: string; text?: string };
  speech?: SpeechSettings;
}): ScriptItem[] {
  const speech = request.speech;
  const text = request.subtitles?.text || (speech?.mode === "narration" ? speech.text : "") || "";
  if (!text.trim()) return [];
  return [
    {
      id: "legacy-script",
      startSeconds: speech?.mode === "narration" ? (speech.startSeconds ?? 0) : 0,
      endSeconds: typeof request.duration === "number" ? request.duration : 180,
      text,
      showSubtitles: Boolean(request.subtitles && request.subtitles.mode !== "off"),
      speech:
        speech?.mode === "narration" ? NarrationItemSpeechSchema.parse(speech) : { mode: "off" },
    },
  ];
}
/** Renderer-independent model instructions; supplied text stays quoted data. */
export function scriptItemsDirection(items: ScriptItem[] | undefined, preview = false) {
  if (items === undefined) return "";
  return `TIMED SCRIPT ITEMS (authoritative; supersede legacy speech and subtitles fields):
${items
  .map((item, index) =>
    JSON.stringify({
      item: index + 1,
      id: item.id,
      startSeconds: item.startSeconds,
      endSeconds: item.endSeconds,
      ...(item.source === "write"
        ? { source: "write", instructions: item.text }
        : { text: item.text }),
      showSubtitles: item.showSubtitles,
      speech:
        item.speech.mode === "narration"
          ? {
              enabled: true,
              engine: item.speech.engine || "kokoro",
              voice: item.speech.voice,
              language: speechLanguage(item.speech.voice, item.speech.engine, item.speech.language),
              volume: item.speech.volume ?? 1,
              speed: item.speech.speed,
            }
          : { enabled: false },
    }),
  )
  .join("\n")}
This list controls script and caption copy even if style-context.json retains earlier writing instructions. For source=write items, write the spoken/caption text from the item instructions, approved plan and actual captured evidence during building. Never display those instructions as captions. Supplied text is content. Each item's start/end are absolute film seconds. Display its exact text only when showSubtitles is true and only inside its window. Speech and text visibility are independent: subtitle-only items must remain silent; spoken items with showSubtitles false must have no subtitle captions. Per-item language and voice selections override global delivery language for these items; do not translate their supplied text automatically. Create enabled speech through the internal create_narration MCP tool using each item ID as scriptItemId; edit_narration handles later corrections. The tool uses Kiteva's existing speech engine and returns measured cues. The application mixes the accepted track after rendering; do not embed duplicate vocals. Use measured cues belonging to each item's ID for matching spoken captions, and readable pacing within the supplied window for silent text. Preserve gaps and do not stretch speech or spill text/audio into another window. ${preview ? "Direction previews stay silent; use only an appropriate short text excerpt, never compress the entire timeline into the preview." : "Include every enabled text item and its times in STORYBOARD.json. Items with both controls off add no speech or subtitle text."}`;
}

/** Timed items own text visibility whenever present, including an empty list. */
export function hasOnScreenSubtitles(request: {
  scriptItems?: Pick<ScriptItem, "showSubtitles">[];
  subtitles?: { mode: string };
}) {
  return request.scriptItems !== undefined
    ? request.scriptItems.some((item) => item.showSubtitles)
    : Boolean(request.subtitles && request.subtitles.mode !== "off");
}
