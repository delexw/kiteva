import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createReactBitsTools } from "./react-bits-tools";

const config = z
  .object({ workspace: z.string(), readOnly: z.boolean() })
  .parse(JSON.parse(process.argv[2]));
const controller = new AbortController();
const server = createReactBitsTools({ ...config, signal: controller.signal });
const close = () => {
  controller.abort();
  void server.close().finally(() => process.exit(0));
};
process.once("SIGTERM", close);
process.once("SIGINT", close);
process.stdin.once("end", close);
await server.connect(new StdioServerTransport());
