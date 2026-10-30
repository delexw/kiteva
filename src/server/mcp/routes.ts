import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { FastifyInstance } from "fastify";
import { kitevaMcpPath } from "../../shared/kiteva-mcp";
import { createKitevaMcpTools, type KitevaMcpDependencies } from "./tools";

/** Bundle the agent interface into the application's existing HTTP listener. */
export function registerKitevaMcpRoutes(app: FastifyInstance, dependencies: KitevaMcpDependencies) {
  // This guard lives across HTTP requests, rather than inside an individual MCP connection.
  let submitting = false;
  const start: KitevaMcpDependencies["start"] = async (request) => {
    if (submitting) throw Error("An idea submission is already in progress; do not submit twice.");
    submitting = true;
    try {
      return await dependencies.start(request);
    } finally {
      submitting = false;
    }
  };
  const connections = new Set<() => Promise<void>>();
  app.addHook("onClose", async () => {
    await Promise.allSettled([...connections].map((close) => close()));
  });
  app.route({
    method: ["POST", "GET", "DELETE"],
    url: kitevaMcpPath,
    bodyLimit: 512_000,
    onRequest: async (request, reply) => {
      // The existing app is local-only. Preserve that boundary for direct/dev access too.
      let hostname: string;
      try {
        hostname = new URL(`http://${request.headers.host}`).hostname;
      } catch {
        return reply.code(403).send({ error: "Local host required" });
      }
      if (!["127.0.0.1", "localhost", "[::1]"].includes(hostname))
        return reply.code(403).send({ error: "Local host required" });
      const origin = request.headers.origin;
      if (
        origin &&
        !new Set([new URL(dependencies.webUrl).origin, `http://${request.headers.host}`]).has(
          origin,
        )
      )
        return reply.code(403).send({ error: "Foreign origin rejected" });
    },
    handler: async (request, reply) => {
      const server = createKitevaMcpTools({ ...dependencies, start });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      let closed: Promise<void> | undefined;
      const close = () =>
        (closed ??= Promise.allSettled([server.close(), transport.close()]).then(() => {
          connections.delete(close);
        }));
      connections.add(close);
      reply.raw.once("close", () => {
        void close();
      });
      await server.connect(transport);
      reply.hijack();
      try {
        await transport.handleRequest(request.raw, reply.raw, request.body);
      } finally {
        await close();
      }
    },
  });
}
