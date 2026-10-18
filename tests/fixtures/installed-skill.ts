import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Minimal local fixture; never downloads or executes upstream skill code. */
export async function skillInstallationFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "installed-skill-test-"));
  const revision = "a".repeat(40);
  const directory = path.join(root, "anatomy", revision);
  await mkdir(directory, { recursive: true });
  const files: Record<string, string> = {};
  for (const [name, content] of Object.entries({
    "SKILL.md": "---\nname: anatomy\ndescription: Test illustration skill\n---\nTest fixture.\n",
    "kit/turn.mjs": "export const fixture = true;\n",
    LICENSE: "MIT License\nTest fixture only.\n",
  })) {
    await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await writeFile(path.join(directory, name), content);
    files[name] = createHash("sha256").update(content).digest("hex");
  }
  const manifest = { repository: "https://github.com/wheresryan22/anatomy.git", revision, files };
  await writeFile(path.join(root, "anatomy/current.json"), JSON.stringify(manifest));
  return { root, directory, manifest };
}
