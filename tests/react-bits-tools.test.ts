import { prepareProjectLayout, workspaceFolders } from "../src/server/runtime/workspace";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { createReactBitsTools } from "../src/server/agents/capabilities/react-bits/tools";
import { agentCapabilities } from "../src/server/agents/capabilities/registry";

const name = "GenericPulse-TS-CSS";
const item = {
  name,
  description: "A pulse",
  dependencies: ["react"],
  registryDependencies: [],
  files: [
    {
      path: "GenericPulse/GenericPulse.tsx",
      content: "export default function Pulse() { return null; }",
      target: "../../escape.tsx",
    },
  ],
};
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function connect(
  readOnly: boolean,
  payload: unknown = item,
  license = "Copyright example\nMIT + Commons Clause",
) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "component-tools-"));
  cleanups.push(() => rm(workspace, { recursive: true, force: true }));
  const request = vi.fn<typeof fetch>(
    async (input) =>
      new Response(
        String(input).endsWith("registry.json")
          ? JSON.stringify({
              items: [
                { name, description: "A pulse" },
                { name: "GenericUtility-TS", description: "A utility" },
              ],
            })
          : String(input).endsWith("LICENSE.md")
            ? license
            : JSON.stringify(payload),
      ),
  );
  const controller = new AbortController();
  const server = createReactBitsTools({
    workspace,
    readOnly,
    signal: controller.signal,
    fetch: request,
  });
  const client = new Client({ name: "test-client", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  cleanups.push(() => client.close());
  cleanups.push(() => server.close());
  return { client, workspace, request, controller };
}
it("advertises discovery only during planning, and rejects a guessed install call without writes", async () => {
  const { client, workspace, request } = await connect(true);
  expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
    "search_components",
    "read_component",
  ]);
  const found = await client.callTool({ name: "search_components", arguments: { query: "pulse" } });
  expect(found.structuredContent).toMatchObject({ kind: "discovery", items: [{ name }] });
  const source = await client.callTool({ name: "read_component", arguments: { name } });
  expect(source.structuredContent).toMatchObject({ kind: "source", item });
  await client.callTool({ name: "read_component", arguments: { name } });
  expect(request).toHaveBeenCalledTimes(2);
  const denied = await client.callTool({ name: "install_component", arguments: { name } });
  expect(denied.isError).toBe(true);
  expect(await readdir(workspace)).toEqual([]);
  expect(
    request.mock.calls.every(
      ([url, init]) =>
        String(url).startsWith("https://reactbits.dev/r/") && init?.redirect === "error",
    ),
  ).toBe(true);
});
it.each([false, true])(
  "installs source safely using the project layout (versioned=%s)",
  async (versioned) => {
    const { client, workspace } = await connect(false);
    if (versioned) await prepareProjectLayout(workspace);
    expect((await client.listTools()).tools.map((tool) => tool.name)).toContain(
      "install_component",
    );
    const result = await client.callTool({ name: "install_component", arguments: { name } });
    expect(result.isError).not.toBe(true);
    const installed = result.structuredContent as { directory: string };
    const directory = path.join(workspace, installed.directory);
    expect(await readFile(path.join(directory, item.files[0].path), "utf8")).toBe(
      item.files[0].content,
    );
    expect(await readFile(path.join(directory, "LICENSE.md"), "utf8")).toContain("Commons Clause");
    expect(
      JSON.parse(await readFile(path.join(directory, "provenance.json"), "utf8")),
    ).toMatchObject({
      source: `https://reactbits.dev/r/${name}.json`,
      dependencies: ["react"],
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    const again = await client.callTool({ name: "install_component", arguments: { name } });
    expect((again.structuredContent as { directory: string }).directory).not.toBe(
      installed.directory,
    );
    if (versioned)
      expect(installed.directory.startsWith(`${workspaceFolders.components}/`)).toBe(true);
    else expect(await readdir(workspace)).toEqual(["components"]);
  },
);
it.each(["../escape.tsx", "/escape.tsx", "C:/escape.tsx", "a\\escape.tsx", "a/../../escape.tsx"])(
  "rejects upstream path %s before writing",
  async (filePath) => {
    const { client, workspace } = await connect(false, {
      ...item,
      files: [{ path: filePath, content: "untrusted" }],
    });
    const result = await client.callTool({ name: "install_component", arguments: { name } });
    expect(result.isError).toBe(true);
    expect(await readdir(workspace)).toEqual([]);
  },
);
it("rejects linked output directories and preserves the outside directory", async () => {
  const { client, workspace } = await connect(false);
  const outside = await mkdtemp(path.join(os.tmpdir(), "outside-components-"));
  cleanups.push(() => rm(outside, { recursive: true, force: true }));
  await symlink(
    outside,
    path.join(workspace, "components"),
    process.platform === "win32" ? "junction" : "dir",
  );
  expect((await client.callTool({ name: "install_component", arguments: { name } })).isError).toBe(
    true,
  );
  expect(await readdir(outside)).toEqual([]);
});
it.each([
  { ...item, name: "Different-TS-CSS" },
  { ...item, registryDependencies: ["https://example.com/arbitrary.json"] },
  { ...item, files: [{ path: "LICENSE.md", content: "replacement" }] },
  {
    ...item,
    files: [
      { path: "a.tsx", content: "one" },
      { path: "A.tsx", content: "two" },
    ],
  },
])("rejects mismatched identity, nested downloads and file conflicts", async (payload) => {
  const { client, workspace } = await connect(false, payload);
  expect((await client.callTool({ name: "install_component", arguments: { name } })).isError).toBe(
    true,
  );
  expect(await readdir(workspace)).toEqual([]);
});
it("fails clearly when upstream license is unavailable", async () => {
  const { client, workspace } = await connect(false, item, "not a license");
  expect((await client.callTool({ name: "install_component", arguments: { name } })).isError).toBe(
    true,
  );
  expect(await readdir(workspace)).toEqual([]);
});
it("returns upstream failures and supports cancellation without executing or writing source", async () => {
  const { client, request, controller, workspace } = await connect(false);
  request.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
  expect(
    await client.callTool({ name: "search_components", arguments: { query: "" } }),
  ).toMatchObject({
    isError: true,
    structuredContent: { kind: "error", message: expect.stringContaining("503") },
  });
  controller.abort();
  expect((await client.callTool({ name: "read_component", arguments: { name } })).isError).toBe(
    true,
  );
  expect(await readdir(workspace)).toEqual([]);
});
it("registers separate guidance, Windows-safe loader URLs, and no tools for text-only turns", () => {
  const planning = agentCapabilities("/job", true);
  expect(planning.servers.react_bits.enabledTools).toEqual(["search_components", "read_component"]);
  expect(planning.servers.react_bits.args[1]).toMatch(/^file:/);
  expect(JSON.parse(planning.servers.react_bits.args.at(-1)!)).toEqual({
    workspace: "/job",
    readOnly: true,
  });
  expect(agentCapabilities("/job").servers.react_bits.enabledTools).toContain("install_component");
  expect(agentCapabilities("/job", false, true)).toEqual({ servers: {}, guidance: "" });
  expect(planning.guidance).toContain("Preserve the chosen renderer");
  expect(planning.guidance).toContain("absolute video time");
});

it("accepts JS/TS-only registry entries without breaking discovery or source reads", async () => {
  const utilityName = "GenericUtility-TS";
  const { client } = await connect(true, { ...item, name: utilityName });
  const found = await client.callTool({
    name: "search_components",
    arguments: { query: "utility" },
  });
  expect(found.isError).not.toBe(true);
  expect(found.structuredContent).toMatchObject({
    kind: "discovery",
    items: [{ name: utilityName }],
  });
  expect(
    (await client.callTool({ name: "read_component", arguments: { name: utilityName } }))
      .structuredContent,
  ).toMatchObject({ kind: "source", item: { name: utilityName } });
});
