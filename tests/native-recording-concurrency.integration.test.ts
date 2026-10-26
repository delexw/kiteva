import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import { expect, it } from "vitest";

const ResultSchema = z.object({
  ok: z.literal(true),
  started: z.number(),
  stopped: z.number(),
  duration: z.number().positive(),
  assetPath: z.string().endsWith(".webm"),
});

it.skipIf(process.env.KITEVA_TEST_LOCAL_OPENSCREEN !== "1")(
  "five separate builders record, save, review and export without overlapping native recordings",
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "native-recording-builders-"));
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "text/html");
      response.end(
        `<!doctype html><title>Capture fixture</title><style>body{background:#eee;font:30px sans-serif}button{font:30px sans-serif;padding:40px}</style><h1>Capture concurrency fixture</h1><button onclick="this.textContent='Done'">Run test</button>`,
      );
    });
    const children: ReturnType<typeof spawn>[] = [];
    let ready = 0;
    try {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw Error("Missing fixture address");
      const results = await Promise.allSettled(
        Array.from(
          { length: 5 },
          (_, index) =>
            new Promise<z.infer<typeof ResultSchema>>((resolve, reject) => {
              const child = spawn(
                process.execPath,
                [
                  "--import",
                  "tsx",
                  fileURLToPath(new URL("./fixtures/native-recording-worker.ts", import.meta.url)),
                  `http://127.0.0.1:${address.port}`,
                  path.join(root, `direction-${index + 1}`),
                ],
                { stdio: ["ignore", "ignore", "pipe", "ipc"] },
              );
              children.push(child);
              let result: unknown;
              let stderr = "";
              child.stderr?.on("data", (chunk) => {
                stderr += String(chunk);
              });
              const cancelOthers = () =>
                children.forEach((other) => {
                  if (other.connected) other.send("cancel");
                });
              child.on("message", (message) => {
                if (z.object({ ready: z.literal(true) }).safeParse(message).success) {
                  ready++;
                  if (ready === 5) children.forEach((other) => other.send("start"));
                } else {
                  result = message;
                  if (!ResultSchema.safeParse(result).success) cancelOthers();
                }
              });
              child.once("error", (error) => {
                cancelOthers();
                reject(error);
              });
              child.once("exit", (code) => {
                const parsed = ResultSchema.safeParse(result);
                if (code !== 0 || !parsed.success) {
                  cancelOthers();
                  reject(Error(JSON.stringify({ result, code, stderr })));
                } else resolve(parsed.data);
              });
            }),
        ),
      );
      const successful = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      expect(results.filter((result) => result.status === "rejected")).toEqual([]);
      expect(successful).toHaveLength(5);
      successful.sort((a, b) => a.started - b.started);
      for (let index = 1; index < successful.length; index++)
        expect(successful[index].started).toBeGreaterThanOrEqual(successful[index - 1].stopped);
    } finally {
      children.forEach((child) => {
        if (child.exitCode === null) child.kill("SIGTERM");
      });
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  },
  120000,
);
