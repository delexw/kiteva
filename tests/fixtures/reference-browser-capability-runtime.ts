import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { referenceBrowserCapability } from "../../src/server/agents/capabilities/reference-browser/capability";

const workspace = await mkdtemp(path.join(os.tmpdir(), "browser-capability-"));
const web = createServer((_request, response) => {
  response.setHeader("content-type", "text/html");
  response.end("<h1>Example application</h1><button>Read details</button>");
});
await new Promise<void>((resolve) => web.listen(0, "127.0.0.1", resolve));
const address = web.address();
if (!address || typeof address === "string") throw Error("Missing fixture address");
const capability = referenceBrowserCapability(workspace, {
  referenceUrls: [`http://127.0.0.1:${address.port}`],
  readOnly: true,
})!;
const client = new Client({ name: "capability-runtime-test", version: "1" });
const transport = new StdioClientTransport({
  command: capability.command,
  args: capability.args,
  env: Object.fromEntries(
    Object.entries({
      ...process.env,
      ...capability.env,
      KITEVA_CAPTURE_WORKER_URL: "",
      KITEVA_CAPTURE_DESKTOP: "",
    }).filter((entry): entry is [string, string] => entry[1] !== undefined),
  ),
  stderr: "pipe",
});
try {
  await client.connect(transport);
  assert.deepEqual(
    (await client.listTools()).tools.map((tool) => tool.name),
    capability.enabledTools,
  );
  const result = await client.callTool({
    name: "inspect_page",
    arguments: { url: `http://127.0.0.1:${address.port}` },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result.structuredContent));
  const resultData = result.structuredContent as { kind: string; page: { text: string } };
  assert.equal(resultData.kind, "inspection");
  assert.match(resultData.page.text, /Example application/);
  console.log(
    JSON.stringify({
      discovery: "passed",
      inspection: "passed",
      toolCount: capability.enabledTools.length,
    }),
  );
} finally {
  await client.close();
  await new Promise<void>((resolve, reject) =>
    web.close((error) => (error ? reject(error) : resolve())),
  );
  await rm(workspace, { recursive: true, force: true });
}
