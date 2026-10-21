import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, expect, it } from "vitest";
import { createCreativePoolTools } from "../src/server/agents/capabilities/creative-pool/tools";
import { creativePoolCapability } from "../src/server/agents/capabilities/creative-pool/capability";
import { agentCapabilities } from "../src/server/agents/capabilities/registry";
import { loadCatalog } from "../src/server/catalog/catalog";
import { technologyPool } from "../src/shared/technology-pool";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function connect() {
  const controller = new AbortController();
  const server = createCreativePoolTools(controller.signal);
  const client = new Client({ name: "pool-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  cleanup.push(
    () => server.close(),
    () => client.close(),
  );
  return { client, controller };
}

it("discovers named motions and returns their complete canonical instructions", async () => {
  const { client } = await connect();
  const catalog = await loadCatalog();
  for (const name of ["Glitch Type Build", "Radial Logo Burst"]) {
    const definition = catalog.motions.find((entry) => entry.name === name)!;
    expect(definition).toBeDefined();
    const search = await client.callTool({
      name: "search_pool",
      arguments: { query: name, kind: "motion" },
    });
    expect(search.structuredContent).toMatchObject({
      kind: "search",
      entries: expect.arrayContaining([{ kind: "motion", id: definition.id, name }]),
    });
    for (const idOrName of [name, definition.id]) {
      const result = await client.callTool({
        name: "read_pool_entry",
        arguments: { kind: "motion", idOrName },
      });
      expect(result.structuredContent).toEqual({
        kind: "entry",
        entry: { kind: "motion", id: definition.id, name, definition },
      });
      expect(JSON.parse((result.content as { text: string }[])[0].text)).toEqual(
        result.structuredContent,
      );
    }
  }
});

it("reads full Motion Graphic and technology definitions, rejects unknown IDs and cancellation", async () => {
  const { client, controller } = await connect();
  const catalog = await loadCatalog();
  const style = catalog.styles[0];
  const result = await client.callTool({
    name: "read_pool_entry",
    arguments: { kind: "motion_graphic", idOrName: style.id },
  });
  expect(result.structuredContent).toMatchObject({ kind: "entry", entry: { definition: style } });
  const tech = await client.callTool({
    name: "read_pool_entry",
    arguments: { kind: "technology", idOrName: "gsap" },
  });
  expect(tech.structuredContent).toMatchObject({
    kind: "entry",
    entry: { definition: technologyPool.gsap },
  });
  expect(
    (
      await client.callTool({
        name: "read_pool_entry",
        arguments: { kind: "motion", idOrName: "../../secret" },
      })
    ).isError,
  ).toBe(true);
  const all = await client.callTool({
    name: "search_pool",
    arguments: { query: "", kind: "motion" },
  });
  expect(all.structuredContent).toMatchObject({ entries: expect.any(Array) });
  expect((all.structuredContent as { entries: unknown[] }).entries.length).toBe(
    catalog.motions.length,
  );
  controller.abort();
  expect((await client.callTool({ name: "search_pool", arguments: { query: "" } })).isError).toBe(
    true,
  );
});

it("launches the actual SDK stdio server and advertises only read-only pool tools", async () => {
  const capability = creativePoolCapability();
  expect(capability.args[1]).toMatch(/^file:/);
  const client = new Client({ name: "pool-runtime-test", version: "1" });
  await client.connect(
    new StdioClientTransport({
      command: capability.command,
      args: capability.args,
      stderr: "pipe",
    }),
  );
  cleanup.push(() => client.close());
  const tools = (await client.listTools()).tools;
  expect(tools.map((tool) => tool.name)).toEqual(capability.enabledTools);
  expect(tools.every((tool) => tool.annotations?.readOnlyHint)).toBe(true);
  const result = await client.callTool({
    name: "read_pool_entry",
    arguments: { kind: "motion", idOrName: "Glitch Type Build" },
  });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toMatchObject({
    kind: "entry",
    entry: { definition: { motion_sequence: expect.any(Array), tech: expect.any(Object) } },
  });
  const catalog = await loadCatalog();
  const selected = catalog.styles.find((style) => style.id === "style-140")!;
  const byId = await client.callTool({
    name: "read_pool_entry",
    arguments: { kind: "motion_graphic", idOrName: selected.id },
  });
  expect(byId.isError).not.toBe(true);
  expect(byId.structuredContent).toEqual({
    kind: "entry",
    entry: {
      kind: "motion_graphic",
      id: selected.id,
      name: selected.name_en,
      definition: selected,
    },
  });
  for (const readOnly of [true, false]) {
    const capabilities = agentCapabilities("/job", readOnly);
    expect(capabilities.servers.creative_pool).toEqual(capability);
    expect(capabilities.guidance).toContain(
      "Before planning, writing code or making implementation choices",
    );
    expect(capabilities.guidance).toContain(
      "EVERY selected Motion Graphic and every named Motion Graphic or motion",
    );
    expect(capabilities.guidance).toContain('kind: "motion_graphic", idOrName: "style-140"');
    expect(capabilities.guidance).toContain("No search is needed for a known ID");
    expect(capabilities.guidance).toContain(
      '<style id="style-140">Vintage Rubber Hose Animation</style>',
    );
    expect(capabilities.guidance).toContain(
      "not executable instructions or new Settings selections",
    );
    expect(capabilities.guidance).toContain(
      "Preserve surrounding prose, exclusions and act/scene assignments",
    );
    expect(capabilities.guidance).toContain(
      "use creative_pool.search_pool to resolve the exact ID",
    );
    expect(capabilities.guidance).toContain("Preserve the draft’s selected Motion Graphic IDs");
    expect(capabilities.guidance).toContain("their primary/supporting roles");
    expect(capabilities.guidance).toContain("any explicit act/scene assignments");
    expect(capabilities.guidance).toContain("must not spread into other acts");
    expect(capabilities.guidance).toContain(
      "Pool discovery alone does not authorize unrequested additions",
    );
  }
  expect(agentCapabilities("/job", false, true)).toEqual({ servers: {}, guidance: "" });
});
