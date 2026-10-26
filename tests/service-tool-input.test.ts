import { expect, it } from "vitest";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { serviceToolInput } from "../src/server/agents/capabilities/shared/service-tool-input";

it("publishes nested service constraints while leaving defaults and argument validation with the service", async () => {
  const contract = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      items: { type: "array", minItems: 1, items: { type: "string", enum: ["first", "second"] } },
      amount: { type: "number", minimum: 0, default: 4 },
    },
    required: ["items"],
    additionalProperties: false,
  };
  const server = new McpServer({ name: "example-service", version: "1" });
  server.registerTool(
    "example_operation",
    { inputSchema: serviceToolInput(contract) },
    async (input) => ({
      content: [{ type: "text", text: JSON.stringify(input) }],
      structuredContent: input,
    }),
  );
  const client = new Client({ name: "example-client", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(b);
    await client.connect(a);
    expect((await client.listTools()).tools[0].inputSchema).toEqual(contract);
    const input = { items: ["first"], extra: "preserve" };
    expect(
      (await client.callTool({ name: "example_operation", arguments: input })).structuredContent,
    ).toEqual(input);
    const invalid = { amount: -1 };
    expect(
      (await client.callTool({ name: "example_operation", arguments: invalid })).structuredContent,
    ).toEqual(invalid);
  } finally {
    await client.close();
    await server.close();
  }
});

it("keeps schema metadata and unconstrained upstream object arguments", () => {
  const schema = {
    type: "object",
    title: "Example parameters",
    description: "Forward to the service",
    properties: { mode: { anyOf: [{ type: "string" }, { type: "null" }], default: null } },
  };
  const input = serviceToolInput(schema);
  expect(z.toJSONSchema(input, { io: "input" })).toMatchObject(schema);
  expect(input.parse({ nested: { value: 1 } })).toEqual({ nested: { value: 1 } });
});
