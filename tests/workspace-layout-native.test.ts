import { mkdtemp, writeFile, readFile, access, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { expect, it } from "vitest";
import {
  prepareProjectLayout,
  projectArtifactPath,
  workspaceFolders,
} from "../src/server/runtime/workspace";
import { validatePage } from "../src/server/domains/page/validation";
import { PageProductionSchema } from "../src/shared/agents/schemas/page";
import type { PageGenerationJob } from "../src/shared/domains/page";

it.skipIf(process.env.KITEVA_TEST_LOCAL_WORKSPACE !== "1")(
  "loads a real page from artifacts and writes validation outputs outside its input root",
  async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "artifact-page-"));
    try {
      await prepareProjectLayout(workspace);
      const sourceFile = projectArtifactPath(workspace, "index.html");
      await writeFile(
        path.join(workspace, sourceFile),
        '<!doctype html><meta name="viewport" content="width=device-width"><title>Example</title><h1>Example project</h1><p>Readable responsive content.</p><script src="./motion-runtime.js"></script>',
      );
      const production = PageProductionSchema.parse({
        sourceFile,
        title: "Example",
        styleRenderer: ["HTML"],
        interactionEngine: ["DOM"],
        interactions: ["Keyboard navigation"],
        responsiveStrategy: "Fluid layout",
        limitations: [],
      });
      const job: PageGenerationJob = {
        id: "page",
        runId: "project",
        candidateId: "direction",
        kind: "full",
        outputType: "page",
        phase: "validating",
        model: "fixture",
        workspace,
      };
      const result = await validatePage(job, production, new AbortController().signal, () => {});
      expect(result.page).toBe(sourceFile);
      expect(
        JSON.parse(
          await readFile(
            path.join(workspace, workspaceFolders.renders, "page-validation.json"),
            "utf8",
          ),
        ).passed,
      ).toBe(true);
      await expect(
        access(path.join(workspace, workspaceFolders.artifacts, workspaceFolders.renders)),
      ).rejects.toThrow();
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
  30000,
);
