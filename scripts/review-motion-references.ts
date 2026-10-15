import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadCatalog } from "../src/server/catalog/catalog";
import { agentTurn } from "../src/server/agents/providers";
import { examplesFolder } from "../src/server/catalog/style-examples";
import { safeMessage } from "../src/server/runtime/config";
async function main() {
  const c = await loadCatalog();
  const folder = path.join(examplesFolder, "reference-review");
  await mkdir(folder, { recursive: true });
  const schema = z.object({
    styles: z
      .array(
        z.object({
          styleId: z.string().regex(/^style-\d{3}$/),
          keepIds: z.array(z.string().regex(/^motion-\d{3}$/)).max(15),
          reason: z.string().max(700),
        }),
      )
      .length(115),
  });
  const prompt = `Review optional motion references for ALL 115 styles. Use actual actions, not similar names. Remove tenuous references: an orb-drop-and-growth is not generic floating; a camera journey along a double helix needs suitable geometry and subject; an orbit requires complete subject geometry; miniature parallax needs depth-separated scenery; door bloom requires a door and emerging flowers. Keep genuinely natural compatible style-level options only, not anything theoretically possible. Never force one reference. Generic chaptered transitions/storytelling may remain if suitable for that style. This does not prescribe the demo: its actual illustration must be examined separately and choosing NO reference is valid. Return all IDs exactly once, retain only IDs already in each style's candidates, and explain exclusions briefly. Read motions and styles from the complete required input JSON.`;
  await writeFile(path.join(folder, "PROMPT.md"), prompt);
  const result = await agentTurn({
    provider: "claude",
    workspace: folder,
    prompt,
    promptContext: {
      motions: c.motions.map((m) => ({ id: m.id, name: m.name, description: m.description })),
      styles: c.styles.map((s) => ({
        styleId: s.id,
        name: s.name_en,
        cues: s.visual_cues,
        candidateIds: (s.motion_references.candidates as Array<{ motion_id: string }>).map(
          (m) => m.motion_id,
        ),
      })),
    },
    schema,
    signal: AbortSignal.timeout(600000),
    readOnly: true,
    onEvent: () => {},
  });
  const ids = result.value.styles.map((s) => s.styleId);
  if (new Set(ids).size !== 115 || c.styles.some((s) => !ids.includes(s.id)))
    throw Error("Review must cover every style exactly once");
  for (const row of result.value.styles) {
    const s = c.styles.find((s) => s.id === row.styleId)!;
    const existing = (s.motion_references.candidates as Array<{ motion_id: string }>).map(
      (m) => m.motion_id,
    );
    if (row.keepIds.some((id) => !existing.includes(id)))
      throw Error("Review introduced an unrelated reference");
  }
  await writeFile(
    path.join(folder, "review.json"),
    JSON.stringify(
      { catalogHash: c.hash, model: "claude-opus-5-5", styles: result.value.styles },
      null,
      2,
    ),
  );
  console.log("Reviewed all 115 style reference lists; saved for validated application");
}
void main().catch((e) => {
  console.error(safeMessage(e));
  process.exitCode = 1;
});
