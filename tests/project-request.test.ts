import { expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RequestSchema } from "../src/shared/contracts";
import { writeProjectRequest } from "../src/server/requests/project-request";

it("saves complete settings in the supplied project folder and refreshes them on retry", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "project request "));
  try {
    const workspace = path.join(root, "nested project");
    const request = RequestSchema.parse({ instructions: "An original idea", provider: "claude" });
    const file = await writeProjectRequest(workspace, request);
    expect(file).toBe(path.resolve(workspace, "PROJECT_REQUEST.json"));
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ request });
    const revised = { ...request, instructions: "Updated idea" };
    expect(await writeProjectRequest(workspace, revised)).toBe(file);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ request: revised });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
