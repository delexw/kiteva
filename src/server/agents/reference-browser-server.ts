import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createReferenceTools } from "../requests/reference-browser-tools";

const config = z
  .object({
    workspace: z.string(),
    enableVideoCapture: z.boolean().default(false),
    urls: z.array(z.string().url()).min(1),
    mode: z.enum(["local", "hosted"]),
  })
  .parse(JSON.parse(process.argv[2]));
const controller = new AbortController();
const tools = createReferenceTools({
  ...config,
  signal: AbortSignal.any([controller.signal, AbortSignal.timeout(600000)]),
});
const close = () => {
  controller.abort();
  void tools.close().finally(() => process.exit(0));
};
process.once("SIGTERM", close);
process.once("SIGINT", close);
process.stdin.once("end", close);
await tools.server.connect(new StdioServerTransport());
