import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCreativePoolTools } from "./tools";

const controller = new AbortController();
const server = createCreativePoolTools(
  controller.signal,
  process.env.KITEVA_POOL_INCLUDE_ALTERNATIVES !== "false",
  {
    workspace: process.env.KITEVA_POOL_WORKSPACE,
    readOnly: process.env.KITEVA_POOL_READ_ONLY !== "false",
  },
);
const close = () => {
  controller.abort();
  void server.close().finally(() => process.exit(0));
};
process.once("SIGTERM", close);
process.once("SIGINT", close);
process.stdin.once("end", close);
await server.connect(new StdioServerTransport());
