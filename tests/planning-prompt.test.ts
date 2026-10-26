import { expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileBackedPlanningPrompt } from "../src/server/agents/planning-prompt";

it("writes complete instructions before returning a short prompt with the actual workspace path", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "planning prompt "));
  try {
    const workspace = path.join(root, "nested");
    const instructions = "Original idea and rules\n".repeat(100);
    const prompt = await fileBackedPlanningPrompt(workspace, "PLAN.md", instructions);
    const file = path.resolve(workspace, "PLAN.md");
    expect(await readFile(file, "utf8")).toBe(instructions);
    expect(prompt).toContain(JSON.stringify(file));
    expect(prompt).not.toContain(instructions);
    expect(prompt.length).toBeLessThan(instructions.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
