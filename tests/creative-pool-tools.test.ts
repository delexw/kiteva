import { technologyRuntimeFixture } from "./fixtures/technology-runtime";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, expect, it } from "vitest";
import { createCreativePoolTools } from "../src/server/agents/capabilities/creative-pool/tools";
import { creativePoolCapability } from "../src/server/agents/capabilities/creative-pool/capability";
import { agentCapabilities } from "../src/server/agents/capabilities/registry";
import { loadCatalog } from "../src/server/catalog/catalog";
import { technologyPool } from "../src/shared/technology-pool";
import { mkdtemp, rm, readFile, mkdir, writeFile, readdir, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function connect(
  includeAlternatives = true,
  options: { workspace?: string; readOnly?: boolean } = {},
) {
  const controller = new AbortController();
  const server = createCreativePoolTools(controller.signal, includeAlternatives, options);
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

it.each([true, false])(
  "requires relevant technology discovery while preserving model choice (%s)",
  (readOnly) => {
    const { guidance } = agentCapabilities("/job", readOnly);
    expect(guidance).toContain("Before implementation, call creative_pool.inspect_technologies");
    expect(guidance).toContain("including native features");
    expect(guidance).toContain("project-local environments");
    expect(guidance).toContain("Keep Kiteva’s dependencies unchanged");
    expect(guidance).toContain("document actual tool use and plan changes");
  },
);

it("reports availability on demand through MCP and prepares only a chosen technology during builds", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "pool-technologies-"));
  cleanup.push(() => rm(workspace, { recursive: true, force: true }));
  const { client } = await connect(true, { workspace, readOnly: false });
  const available = await client.callTool({
    name: "inspect_technologies",
    arguments: { ids: ["gsap", "layered_png_assets"] },
  });
  expect(available.structuredContent).toMatchObject({
    kind: "availability",
    technologies: [
      { id: "gsap", status: "unavailable" },
      { id: "layered_png_assets", status: "requires_assets" },
    ],
  });
  await technologyRuntimeFixture(workspace, "gsap");
  const prepared = await client.callTool({ name: "prepare_technology", arguments: { id: "gsap" } });
  expect(prepared.isError).not.toBe(true);
  expect(prepared.structuredContent).toMatchObject({
    kind: "prepared",
    technology: { id: "gsap", modulePath: expect.any(String) },
  });
  expect(JSON.parse((prepared.content as { text: string }[])[0].text)).toEqual(
    prepared.structuredContent,
  );
  const output = prepared.structuredContent as { technology: { modulePath: string } };
  expect(await readFile(path.join(workspace, output.technology.modulePath), "utf8")).toContain(
    "gsap",
  );
  const readOnly = await connect(true, { workspace, readOnly: true });
  expect((await readOnly.client.listTools()).tools.map((tool) => tool.name)).toContain(
    "inspect_technologies",
  );
  expect((await readOnly.client.listTools()).tools.map((tool) => tool.name)).not.toContain(
    "prepare_technology",
  );
  expect((await readOnly.client.listTools()).tools.map((tool) => tool.name)).not.toContain(
    "prepare_technology_stylesheet",
  );
  const denied = await readOnly.client.callTool({
    name: "prepare_technology",
    arguments: { id: "gsap" },
  });
  expect(denied.isError).toBe(true);
});

it("returns typed MCP errors for invalid technology inputs without changing the project", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "invalid-tool-runtime-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "outside-tool-runtime-"));
  cleanup.push(
    () => rm(workspace, { recursive: true, force: true }),
    () => rm(outside, { recursive: true, force: true }),
  );
  await symlink(outside, path.join(workspace, "escape"), "junction");
  const { client } = await connect(true, { workspace, readOnly: false });
  for (const args of [
    { ids: ["unknown"] },
    { ids: ["gsap"], runtimeDirectory: "escape" },
    { ids: ["pillow"], pythonExecutable: "../outside/python" },
    { ids: ["ffmpeg"], executables: { ffmpeg: path.join(outside, "ffmpeg") } },
    { ids: ["gsap"], executables: { gsap: "anything" } },
  ]) {
    const result = await client.callTool({ name: "inspect_technologies", arguments: args });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ kind: "error", message: expect.any(String) });
    expect((result.content as { text: string }[])[0].text).toBe(
      (result.structuredContent as { message: string }).message,
    );
  }
  expect(await readdir(workspace)).toEqual(["escape"]);
  expect(await readdir(outside)).toEqual([]);
});

it("keeps separately prepared projects isolated during inspection", async () => {
  const first = await mkdtemp(path.join(os.tmpdir(), "first-tool-runtime-"));
  const second = await mkdtemp(path.join(os.tmpdir(), "second-tool-runtime-"));
  cleanup.push(
    () => rm(first, { recursive: true, force: true }),
    () => rm(second, { recursive: true, force: true }),
  );
  await technologyRuntimeFixture(first, "matter_js");
  const prepared = await connect(true, { workspace: first, readOnly: false });
  const empty = await connect(true, { workspace: second, readOnly: false });
  for (const [client, status] of [
    [prepared.client, "available"],
    [empty.client, "unavailable"],
  ] as const) {
    const result = await client.callTool({
      name: "inspect_technologies",
      arguments: { ids: ["matter_js"] },
    });
    expect(result.structuredContent).toMatchObject({
      kind: "availability",
      technologies: [{ id: "matter_js", status }],
    });
  }
  expect(await readdir(second)).toEqual([]);
});

it("exposes preparation through the actual build-stage stdio server", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "pool-build-runtime-"));
  cleanup.push(() => rm(workspace, { recursive: true, force: true }));
  await technologyRuntimeFixture(workspace, "matter_js");
  const capability = creativePoolCapability(false, workspace, false);
  const client = new Client({ name: "technology-runtime-test", version: "1" });
  await client.connect(
    new StdioClientTransport({
      command: capability.command,
      args: capability.args,
      stderr: "pipe",
      env: { ...process.env, ...capability.env } as Record<string, string>,
    }),
  );
  cleanup.push(() => client.close());
  expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(
    capability.enabledTools,
  );
  const result = await client.callTool({
    name: "prepare_technology",
    arguments: { id: "matter_js" },
  });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toMatchObject({
    kind: "prepared",
    technology: { id: "matter_js", packages: expect.arrayContaining(["matter-js"]) },
  });
});

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
  expect(result.structuredContent).toMatchObject({
    kind: "entry",
    entry: { definition: { id: style.id, visual_cues: style.visual_cues } },
  });
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
      env: { ...process.env, ...capability.env } as Record<string, string>,
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
      definition: expect.objectContaining({ id: selected.id, visual_cues: selected.visual_cues }),
    },
  });
  for (const readOnly of [true, false]) {
    const capabilities = agentCapabilities("/job", readOnly);
    expect(capabilities.servers.creative_pool).toEqual(
      creativePoolCapability(true, "/job", readOnly),
    );
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

it.each([true, false])(
  "filters research metadata and respects the workflow alternatives flag (%s)",
  async (includeAlternatives) => {
    const { client } = await connect(includeAlternatives);
    const catalog = await loadCatalog();
    const style = catalog.styles.find(
      (entry) =>
        entry.palette.source_frame_review &&
        entry.motion_graphic_variants?.length &&
        entry.suggested_combinations,
    )!;
    expect(style).toBeDefined();
    const before = structuredClone(style);
    const result = await client.callTool({
      name: "read_pool_entry",
      arguments: { kind: "motion_graphic", idOrName: style.id },
    });
    const definition = (
      result.structuredContent as { entry: { definition: Record<string, unknown> } }
    ).entry.definition;
    expect(definition).not.toHaveProperty("provenance");
    expect(definition).not.toHaveProperty("combination_guidance_provenance");
    expect(definition.palette).not.toHaveProperty("source_frame_review");
    expect(definition.palette).not.toHaveProperty("background_evidence");
    expect(JSON.stringify(definition)).not.toContain('"review_evidence":');
    expect(definition.visual_cues).toEqual(style.visual_cues);
    expect(definition.executable_prompt_template).toEqual(style.executable_prompt_template);
    expect((definition.palette as Record<string, unknown>).constraints).toEqual(
      style.palette.constraints,
    );
    for (const key of ["motion_graphic_variants", "suggested_combinations"] as const) {
      if (includeAlternatives) expect(definition[key]).toEqual(style[key]);
      else expect(definition).not.toHaveProperty(key);
    }
    expect(JSON.parse((result.content as { text: string }[])[0].text)).toEqual(
      result.structuredContent,
    );
    expect(style).toEqual(before);
  },
);

it("passes the alternatives flag to the actual MCP process", async () => {
  const capability = agentCapabilities("/job", true, false, false).servers.creative_pool;
  expect(capability.env.KITEVA_POOL_INCLUDE_ALTERNATIVES).toBe("false");
  const client = new Client({ name: "pool-filter-runtime-test", version: "1" });
  await client.connect(
    new StdioClientTransport({
      command: capability.command,
      args: capability.args,
      env: { ...process.env, ...capability.env } as Record<string, string>,
      stderr: "pipe",
    }),
  );
  cleanup.push(() => client.close());
  const result = await client.callTool({
    name: "read_pool_entry",
    arguments: { kind: "motion_graphic", idOrName: "style-003" },
  });
  expect(result.isError).not.toBe(true);
  const definition = (
    result.structuredContent as { entry: { definition: Record<string, unknown> } }
  ).entry.definition;
  expect(definition).not.toHaveProperty("suggested_combinations");
  expect(definition).not.toHaveProperty("motion_graphic_variants");
  expect(definition).not.toHaveProperty("provenance");
  expect(definition.palette).not.toHaveProperty("source_frame_review");
});

it("inspects and bundles a nested model-prepared runtime and rejects escape", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "nested-tool-runtime-"));
  cleanup.push(() => rm(workspace, { recursive: true, force: true }));
  const runtime = path.join(workspace, "tools/node");
  await mkdir(runtime, { recursive: true });
  await technologyRuntimeFixture(runtime, "gsap");
  const { client } = await connect(true, { workspace, readOnly: false });
  const result = await client.callTool({
    name: "inspect_technologies",
    arguments: { ids: ["gsap"], runtimeDirectory: "tools/node" },
  });
  expect(result.structuredContent).toMatchObject({
    kind: "availability",
    technologies: [{ id: "gsap", status: "available", version: "1.0.0" }],
  });
  const prepared = await client.callTool({
    name: "prepare_technology",
    arguments: { id: "gsap", runtimeDirectory: "tools/node" },
  });
  expect(prepared.isError).not.toBe(true);
  const invalid = await client.callTool({
    name: "inspect_technologies",
    arguments: { ids: ["gsap"], runtimeDirectory: "../outside" },
  });
  expect(invalid.isError).toBe(true);
  const bin = path.join(workspace, "tools/bin");
  await mkdir(bin);
  await writeFile(
    path.join(bin, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"),
    "fixture",
    { mode: 0o755 },
  );
  const executable = await client.callTool({
    name: "inspect_technologies",
    arguments: {
      ids: ["ffmpeg"],
      executables: {
        ffmpeg: process.platform === "win32" ? "tools/bin/ffmpeg.exe" : "tools/bin/ffmpeg",
      },
    },
  });
  expect(executable.structuredContent).toMatchObject({
    kind: "availability",
    technologies: [
      { id: "ffmpeg", status: "available", executable: expect.stringContaining("tools") },
    ],
  });
});
