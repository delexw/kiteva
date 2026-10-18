import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";

it("captures output using native Node when sandbox user lookup is unavailable", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "capture-child-"));
  try {
    const guard = path.join(root, "user-lookup-denied.mjs");
    await writeFile(
      guard,
      "import os from 'node:os';import {syncBuiltinESMExports} from 'node:module';os.userInfo=()=>{throw Error('Sandbox user lookup unavailable')};syncBuiltinESMExports();",
    );
    const stdout = path.join(root, "stdout");
    const stderr = path.join(root, "stderr");
    const payload = Buffer.from(
      JSON.stringify({
        command: [
          process.execPath,
          "-e",
          "process.stdout.write('中文 output');process.stderr.write('diagnostic')",
        ],
        cwd: root,
        stdout,
        stderr,
      }),
    ).toString("base64url");
    await promisify(execFile)(
      process.execPath,
      [
        "--import",
        pathToFileURL(guard).href,
        fileURLToPath(new URL("../src/server/rendering/sandbox/command-child.ts", import.meta.url)),
        payload,
      ],
      { cwd: root },
    );
    expect(await readFile(stdout, "utf8")).toBe("中文 output");
    expect(await readFile(stderr, "utf8")).toBe("diagnostic");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
