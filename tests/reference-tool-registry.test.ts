import { expect, it } from "vitest";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { referenceToolRegistry } from "../src/server/requests/reference-tool-registry";
import { enabledReferenceTools } from "../src/server/requests/reference-browser-contracts";
import { createReferenceTools } from "../src/server/requests/reference-browser-tools";

it.each([false, true])(
  "publishes registry descriptions, schemas and permissions with recording enabled=%s",
  async (recordingEnabled) => {
    const tools = createReferenceTools({
      workspace: "/tmp/example-job",
      urls: ["https://example.com"],
      mode: "local",
      signal: new AbortController().signal,
      enableVideoCapture: recordingEnabled,
    });
    const client = new Client({ name: "registry-test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await tools.server.connect(serverTransport);
      await client.connect(clientTransport);
      const published = (await client.listTools()).tools;
      expect(Object.keys(referenceToolRegistry)).toHaveLength(25);
      expect(published).toHaveLength(recordingEnabled ? 25 : 9);
      expect(published.map((tool) => tool.name)).toEqual(enabledReferenceTools(!recordingEnabled));
      for (const tool of published) {
        const definition = referenceToolRegistry[tool.name as keyof typeof referenceToolRegistry];
        expect(tool.description).toBe(
          typeof definition.description === "function"
            ? definition.description(recordingEnabled)
            : definition.description,
        );
        const schema = z.toJSONSchema(definition.schema, { io: "input" });
        expect(tool.inputSchema.properties).toEqual(schema.properties);
        expect(tool.inputSchema.required).toEqual(schema.required);
      }
    } finally {
      await client.close();
      await tools.close();
    }
  },
);
