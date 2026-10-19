import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAnimateUiTools } from "../src/server/agents/capabilities/animate-ui-tools";
import { agentCapabilities } from "../src/server/agents/capabilities/registry";
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});
async function connect(readOnly: boolean, filePath = "registry/buttons/sample/index.tsx") {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "animate-tools-"));
  cleanups.push(() => rm(workspace, { recursive: true, force: true }));
  const item = {
    name: "buttons-sample",
    description: "An animated sample",
    dependencies: ["@animate-ui/react", "motion"],
    files: [
      { path: filePath, content: "export const Sample=()=>null", target: "../../escape.tsx" },
    ],
  };
  const request = vi.fn<typeof fetch>(
    async (input) =>
      new Response(
        String(input).endsWith("registry.json")
          ? JSON.stringify({ items: [{ name: item.name, description: item.description }] })
          : String(input).endsWith("LICENSE.md")
            ? "Copyright example\nMIT + Commons Clause"
            : JSON.stringify(item),
      ),
  );
  const server = createAnimateUiTools({
    workspace,
    readOnly,
    signal: new AbortController().signal,
    fetch: request,
  });
  const client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  cleanups.push(
    () => server.close(),
    () => client.close(),
  );
  return { client, workspace, request };
}
it("discovers and reads official registry entries during planning without an installation tool", async () => {
  const { client } = await connect(true);
  expect((await client.listTools()).tools.map((t) => t.name)).toEqual([
    "search_components",
    "read_component",
  ]);
  expect(
    (await client.callTool({ name: "search_components", arguments: { query: "sample" } }))
      .structuredContent,
  ).toMatchObject({ kind: "discovery", items: [{ name: "buttons-sample" }] });
  const result = await client.callTool({
    name: "read_component",
    arguments: { name: "buttons-sample" },
  });
  expect(result.structuredContent).toMatchObject({
    kind: "source",
    item: { dependencies: ["@animate-ui/react", "motion"] },
  });
  expect(result.content).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: "text" })]),
  );
  expect(
    (await client.callTool({ name: "install_component", arguments: { name: "buttons-sample" } }))
      .isError,
  ).toBe(true);
});
it("saves source and license under the job while ignoring upstream target paths", async () => {
  const { client, workspace } = await connect(false);
  const result = await client.callTool({
    name: "install_component",
    arguments: { name: "buttons-sample" },
  });
  expect(result.isError).not.toBe(true);
  const value = result.structuredContent as { directory: string; dependencies: string[] };
  expect(value.directory).toMatch(/^components\/animate-ui\/buttons-sample\//);
  expect(
    await readFile(
      path.join(workspace, value.directory, "registry/buttons/sample/index.tsx"),
      "utf8",
    ),
  ).toContain("Sample");
  expect(await readFile(path.join(workspace, value.directory, "LICENSE.md"), "utf8")).toContain(
    "Commons Clause",
  );
  expect(value.dependencies).toContain("@animate-ui/react");
});
it("rejects traversal and exposes the capability to both planning and building", async () => {
  const { client } = await connect(false, "../escape.tsx");
  expect(
    (await client.callTool({ name: "install_component", arguments: { name: "buttons-sample" } }))
      .isError,
  ).toBe(true);
  expect(agentCapabilities("/job", true).servers.animate_ui.enabledTools).toEqual([
    "search_components",
    "read_component",
  ]);
  expect(agentCapabilities("/job", false).servers.animate_ui.enabledTools).toContain(
    "install_component",
  );
  expect(agentCapabilities("/job", true).guidance).toContain("JEV");
  expect(agentCapabilities("/job", false, true).servers).toEqual({});
});
