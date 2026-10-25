import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it } from "vitest";
import { createCreativePoolTools } from "../src/server/agents/capabilities/creative-pool/tools";
import { technologyEnvironment } from "../src/server/technology/availability";
import type { TechnologyToolResult } from "../src/shared/technology-capabilities";

it("inspects a project-provided command and runs the exact returned executable", async (context) => {
  const installed = await technologyEnvironment().inspect("ffmpeg");
  if (!installed.executable || process.platform === "win32") return context.skip();
  const workspace = await mkdtemp(path.join(os.tmpdir(), "technology-command-"));
  const server = createCreativePoolTools(new AbortController().signal, true, {
    workspace,
    readOnly: true,
  });
  const client = new Client({ name: "command-integration", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await mkdir(path.join(workspace, "bin"));
    await symlink(installed.executable, path.join(workspace, "bin/ffmpeg"));
    await server.connect(b);
    await client.connect(a);
    const result = await client.callTool({
      name: "inspect_technologies",
      arguments: { ids: ["ffmpeg"], executables: { ffmpeg: "bin/ffmpeg" } },
    });
    expect(result.isError).not.toBe(true);
    const data = result.structuredContent as unknown as TechnologyToolResult;
    expect(data.kind).toBe("availability");
    if (data.kind !== "availability") throw Error("Expected command availability");
    const command = data.technologies[0];
    expect(command).toMatchObject({ category: "host_tool", status: "available" });
    expect(command.executable).toContain(`${path.sep}bin${path.sep}ffmpeg`);
    const { stdout } = await promisify(execFile)(command.executable!, ["-version"], {
      timeout: 10000,
    });
    expect(stdout).toMatch(/^ffmpeg version /);
  } finally {
    await client.close();
    await server.close();
    await rm(workspace, { recursive: true, force: true });
  }
});
