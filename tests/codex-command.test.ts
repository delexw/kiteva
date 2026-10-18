import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
import { spawn } from "node:child_process";
import {
  NativeCommandSchema,
  runCodexSandboxCommand,
} from "../src/server/rendering/sandbox/codex-command";
let outputRoot: string;
const spec = () => ({
  cli: "/cli.js",
  outputRoot,
  configOverrides: ['default_permissions="kiteva-render"'],
  cwd: "/work",
  command: ["node", "task.js", "a & b"],
});
type RpcMessage = {
  id?: number;
  method?: string;
  params?: { command: string[]; [key: string]: unknown };
};
function executor(reply: (message: RpcMessage, send: (message: unknown) => void) => void) {
  const server = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
  let pending = "";
  server.stdin.on("data", (chunk) => {
    pending += chunk.toString();
    let next;
    while ((next = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, next);
      pending = pending.slice(next + 1);
      reply(JSON.parse(line), (message) => server.stdout.write(JSON.stringify(message) + "\n"));
    }
  });
  vi.mocked(spawn).mockReturnValue(server as never);
  return server;
}
beforeEach(async () => {
  vi.clearAllMocks();
  outputRoot = await mkdtemp(path.join(tmpdir(), "command-output-"));
});
afterEach(async () => {
  await rm(outputRoot, { recursive: true, force: true });
});
it("uses buffered model-free execution, preserving full output and literal argv", async () => {
  const bytes = Buffer.from("中文 stdout");
  const output: Buffer[] = [];
  const requests: RpcMessage[] = [];
  const server = executor((message, send) => {
    requests.push(message);
    if (message.method === "initialize") send({ id: 1, result: {} });
    if (message.method === "command/exec") {
      const capture = JSON.parse(
        Buffer.from(message.params!.command.at(-1)!, "base64url").toString("utf8"),
      );
      expect(capture.command).toEqual(spec().command);
      void writeFile(capture.stdout, bytes).then(() =>
        send({ id: 2, result: { exitCode: 7, stdout: "", stderr: "" } }),
      );
    }
  });
  expect(
    await runCodexSandboxCommand(
      spec(),
      (data) => output.push(data),
      () => {},
    ),
  ).toBe(7);
  expect(Buffer.concat(output)).toEqual(bytes);
  const request = requests.find((r) => r.method === "command/exec")!;
  expect(request.params!.command[1]).toBe("--import");
  expect(new URL(request.params!.command[2]).protocol).toBe("file:");
  expect(fileURLToPath(request.params!.command[2])).toBe(
    createRequire(import.meta.url).resolve("tsx"),
  );
  expect(request.params).not.toHaveProperty("streamStdoutStderr");
  expect(request.params).not.toHaveProperty("outputBytesCap");
  expect(request.params).not.toHaveProperty("disableOutputCap");
  expect(
    requests.some(
      (r) => String(r.method).startsWith("thread/") || String(r.method).startsWith("turn/"),
    ),
  ).toBe(false);
  expect(server.kill).toHaveBeenCalled();
});
it("fails rather than losing unexpected streaming output", async () => {
  executor((message, send) => {
    if (message.method === "initialize") send({ id: 1, result: {} });
    if (message.method === "command/exec") send({ method: "command/exec/outputDelta", params: {} });
  });
  await expect(
    runCodexSandboxCommand(
      spec(),
      () => {},
      () => {},
    ),
  ).rejects.toThrow("Unexpected streaming");
});
it("rejects interactive requests and unsupported payloads", async () => {
  executor((_message, send) => send({ id: 99, method: "requestApproval" }));
  await expect(
    runCodexSandboxCommand(
      spec(),
      () => {},
      () => {},
    ),
  ).rejects.toThrow("interactive setup");
  expect(() => NativeCommandSchema.parse({ ...spec(), command: [] })).toThrow();
});
