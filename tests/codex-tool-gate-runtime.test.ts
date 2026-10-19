import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, access, chmod } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { quote } from "shell-quote";
import TOML from "@iarna/toml";
import { z } from "zod";
import { expect, it } from "vitest";
import { prepareCodexToolHook } from "../src/server/agents/codex-tool-hooks";

it.skipIf(process.platform !== "darwin")(
  "the real Codex pre-tool hook blocks a Blender call before execution while allowing a normal command",
  async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "codex-tool-gate-"));
    let requests = 0;
    let denialReturned = false;
    const marker = path.join(home, "executed");
    const executable = path.join(home, "blender");
    const RequestSchema = z
      .object({
        tools: z.array(z.object({ name: z.string().optional() }).passthrough()).optional(),
      })
      .passthrough();
    const server = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += String(chunk);
      const input = RequestSchema.parse(JSON.parse(body));
      requests++;
      if (body.includes("Blender execution is disabled")) denialReturned = true;
      const tool = input.tools?.find((entry) => entry.name === "exec_command");
      const command = requests === 1 ? quote([executable]) : "echo PERMITTED_COMMAND";
      const item =
        requests <= 2
          ? {
              type: "function_call",
              id: `fc_${requests}`,
              call_id: `call_${requests}`,
              name: tool?.name || "exec_command",
              arguments: JSON.stringify({
                cmd: command,
                yield_time_ms: 1000,
                max_output_tokens: 100,
              }),
            }
          : {
              type: "message",
              id: "msg_final",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text: "Tool gate verified.", annotations: [] }],
            };
      response.writeHead(200, { "content-type": "text/event-stream" });
      const emit = (type: string, extra: Record<string, unknown>) =>
        response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...extra })}\n\n`);
      emit("response.created", {
        response: { id: `resp_${requests}`, status: "in_progress", output: [] },
      });
      emit("response.output_item.added", {
        output_index: 0,
        item: requests <= 2 ? { ...item, arguments: "" } : item,
      });
      if (requests <= 2)
        emit("response.function_call_arguments.delta", {
          item_id: item.id,
          output_index: 0,
          delta: item.arguments,
        });
      emit("response.output_item.done", { output_index: 0, item });
      emit("response.completed", {
        response: {
          id: `resp_${requests}`,
          status: "completed",
          output: [item],
          usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
        },
      });
      response.end();
    });
    let child: ReturnType<typeof spawn> | undefined;
    try {
      await prepareCodexToolHook(home);
      await writeFile(executable, `#!/bin/sh\ntouch ${quote([marker])}\n`);
      await chmod(executable, 0o755);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw Error("Missing fixture address");
      const config = TOML.parse(await readFile(path.join(home, "config.toml"), "utf8"));
      config.model_provider = "fixture";
      config.model = "fixture";
      config.model_providers = {
        fixture: {
          name: "Fixture",
          base_url: `http://127.0.0.1:${address.port}/v1`,
          wire_api: "responses",
          requires_openai_auth: false,
        },
      };
      await writeFile(path.join(home, "config.toml"), TOML.stringify(config));
      child = spawn(
        process.execPath,
        [
          fileURLToPath(import.meta.resolve("@openai/codex/bin/codex.js")),
          "exec",
          "--json",
          "--skip-git-repo-check",
          "--sandbox",
          "workspace-write",
          "-C",
          home,
          "Test the tool policy.",
        ],
        { env: { ...process.env, CODEX_HOME: home }, stdio: ["ignore", "pipe", "pipe"] },
      );
      let output = "";
      child.stdout?.on("data", (chunk) => {
        output += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        output += String(chunk);
      });
      const running = child;
      const status = await new Promise<number | null>((resolve, reject) => {
        const timer = setTimeout(() => {
          running.kill();
          reject(Error("Native tool-hook probe timed out"));
        }, 20000);
        running.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        running.once("exit", (code) => {
          clearTimeout(timer);
          resolve(code);
        });
      });
      expect(status, output).toBe(0);
      expect(denialReturned).toBe(true);
      expect(output).toContain("Command blocked by PreToolUse hook");
      expect(output).toContain("PERMITTED_COMMAND");
      expect(
        await access(marker).then(
          () => true,
          () => false,
        ),
      ).toBe(false);
    } finally {
      child?.kill();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(home, { recursive: true, force: true });
    }
  },
  30000,
);
