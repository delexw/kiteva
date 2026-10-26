import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createReferenceTools } from "./tools";

const config = z
  .object({
    workspace: z.string(),
    enableVideoCapture: z.boolean().default(false),
    captureChapterDurationSeconds: z.number().finite().positive().optional(),
    captureChapterId: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    urls: z.array(z.string().url()).min(1),
    mode: z.enum(["local", "hosted"]),
  })
  .parse(JSON.parse(process.argv[2]));
const controller = new AbortController();
const tools = createReferenceTools({
  ...config,
  signal: controller.signal,
});
const close = () => {
  controller.abort();
  void tools.close().finally(() => process.exit(0));
};
process.once("SIGTERM", close);
process.once("SIGINT", close);
process.stdin.once("end", close);
await tools.server.connect(new StdioServerTransport());
