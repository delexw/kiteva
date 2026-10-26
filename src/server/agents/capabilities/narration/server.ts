import { stopPocketTtsWorker } from "../../../audio/providers/pocket-tts";
import { z } from "zod";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { NarrationConfigSchema } from "../../../audio/narration-types";
import { createNarrationTools } from "./tools";
const { workspace, config } = z
  .object({ workspace: z.string(), config: NarrationConfigSchema })
  .parse(JSON.parse(process.argv[2]));
const server = createNarrationTools(workspace, config);
const close = () => {
  void server.close().finally(async () => {
    await stopPocketTtsWorker();
    process.exit(0);
  });
};
process.once("SIGTERM", close);
process.once("SIGINT", close);
process.stdin.once("end", close);
await server.connect(new StdioServerTransport());
