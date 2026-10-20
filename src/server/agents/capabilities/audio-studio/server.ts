import { z } from "zod";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { connectAudioStudio } from "./client";
import { createAudioStudioTools } from "./tools";
const config = z
  .object({ workspace: z.string(), command: z.string() })
  .parse(JSON.parse(process.argv[2]));
const upstream = await connectAudioStudio(config.workspace, config.command);
const server = await createAudioStudioTools(config.workspace, upstream);
const close = () => {
  void server
    .close()
    .finally(() => upstream.close())
    .finally(() => process.exit(0));
};
process.once("SIGTERM", close);
process.once("SIGINT", close);
process.stdin.once("end", close);
await server.connect(new StdioServerTransport());
