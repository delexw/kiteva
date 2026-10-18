import { spawn } from "node:child_process";
import { closeSync, openSync, appendFileSync } from "node:fs";
import { CommandCaptureSchema } from "./command-payload.ts";

const payload = CommandCaptureSchema.parse(
  JSON.parse(Buffer.from(process.argv[2], "base64url").toString("utf8")),
);
const stdout = openSync(payload.stdout, "a");
const stderr = openSync(payload.stderr, "a");
try {
  const child = spawn(payload.command[0], payload.command.slice(1), {
    cwd: payload.cwd,
    env: process.env,
    stdio: ["ignore", stdout, stderr],
    windowsHide: true,
  });
  child.on("error", (error) => {
    appendFileSync(payload.stderr, error.message);
    process.exitCode = 1;
  });
  child.on("close", (code) => {
    process.exitCode = code ?? 1;
  });
} finally {
  closeSync(stdout);
  closeSync(stderr);
}
