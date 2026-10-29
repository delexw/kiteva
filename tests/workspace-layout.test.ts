import { PageProductionSchema } from "../src/shared/agents/schemas/page";
import { mkdtemp, readFile, writeFile, symlink, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it } from "vitest";
import {
  prepareProjectLayout,
  workspaceFolders,
  workspacePaths,
  renderInputRoot,
  renderSourcePath,
  projectArtifactPath,
  projectLayoutGuidance,
  projectDiagnosticsRoot,
  workspaceOwner,
} from "../src/server/runtime/workspace";
import { renderContract } from "../src/server/rendering/contracts";
const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-layout-"));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
it("exports one fixed relative layout and preserves explicit legacy compatibility", async () => {
  const root = await fixture();
  expect(renderInputRoot(root)).toBe(root);
  expect(workspacePaths(root).assets).toBe("assets");
  await prepareProjectLayout(root);
  expect(workspacePaths(root)).toEqual(workspaceFolders);
  expect(
    PageProductionSchema.shape.sourceFile.safeParse(projectArtifactPath(root, "index.html"))
      .success,
  ).toBe(true);
  expect(projectArtifactPath(root, "shots", "scene.html")).toBe("artifacts/shots/scene.html");
  expect(renderInputRoot(root)).toBe(path.join(root, workspaceFolders.artifacts));
  expect(workspaceOwner(path.join(root, workspaceFolders.shots))).toBe(root);
  expect(projectDiagnosticsRoot(renderInputRoot(root))).toBe(
    path.join(root, workspaceFolders.diagnostics),
  );
  const guidance = projectLayoutGuidance(root);
  expect(guidance).toContain("Builders, correctors, capture, audio and other helper agents");
  expect(guidance).toContain(`--root set to ${workspaceFolders.artifacts}/`);
  expect(guidance).toContain(
    "absolute filesystem path resolved from the workspace and manifest sourceFile",
  );
  for (const role of [
    "artifacts",
    "assets",
    "vendor",
    "taskContext",
    "logs",
    "diagnostics",
    "renders",
    "runtime",
  ] as const) {
    expect(guidance).toContain(`${workspaceFolders[role]}/`);
  }
  expect(JSON.parse(await readFile(path.join(root, ".kiteva-layout.json"), "utf8"))).toEqual({
    version: 1,
    renderInputs: workspaceFolders.artifacts,
  });
});
it("rejects external inputs, traversal, symlink escapes and invalid layout versions", async () => {
  const root = await fixture();
  await prepareProjectLayout(root);
  await writeFile(path.join(root, workspaceFolders.inputs, "context.json"), "{}");
  expect(() => renderSourcePath(root, "task-context/inputs/context.json")).toThrow(
    "designated artifacts",
  );
  expect(() => projectArtifactPath(root, "../task-context/data.json")).toThrow("inside");
  await symlink(
    path.join(root, workspaceFolders.inputs, "context.json"),
    path.join(root, workspaceFolders.artifacts, "linked.json"),
  );
  expect(() => renderSourcePath(root, "artifacts/linked.json")).toThrow("links");
  await writeFile(path.join(root, ".kiteva-layout.json"), '{"version":2,"renderInputs":"other"}');
  expect(() => renderInputRoot(root)).toThrow();
});
it.each(["hyperframes", "multiplane"] as const)(
  "gives %s builders the actual artifact entry path",
  async (renderer) => {
    const root = await fixture();
    await prepareProjectLayout(root);
    const contract = renderContract(renderer, {
      workspace: root,
      width: 1280,
      height: 720,
      duration: 3,
      fps: 30,
      kind: "preview",
    });
    expect(contract).toContain(
      renderer === "multiplane"
        ? "sourceFile to artifacts/shot.html"
        : "sourceFile must be artifacts/index.html",
    );
    if (renderer === "multiplane")
      expect(contract).toContain('"sourceFile":"artifacts/shots/01.html"');
  },
);

it("initializes fresh preparation workspaces without silently migrating existing directories", async () => {
  const root = await fixture();
  const fresh = path.join(root, "fresh");
  await prepareProjectLayout(fresh, { onlyIfNew: true });
  expect(workspacePaths(fresh)).toEqual(workspaceFolders);
  await prepareProjectLayout(root, { onlyIfNew: true });
  expect(renderInputRoot(root)).toBe(root);
});
