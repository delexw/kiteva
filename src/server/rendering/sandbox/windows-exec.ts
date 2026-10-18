import { NativeCommandSchema, runCodexSandboxCommand } from "./codex-command";

try {
  const payload = NativeCommandSchema.parse(
    JSON.parse(Buffer.from(process.argv[2], "base64url").toString("utf8")),
  );
  process.exitCode = await runCodexSandboxCommand(
    payload,
    (data) => process.stdout.write(data),
    (data) => process.stderr.write(data),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
