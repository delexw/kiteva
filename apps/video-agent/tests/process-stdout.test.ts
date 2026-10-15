import { expect, it, vi } from "vitest";
import { command } from "../src/server/runtime/process";

it("preserves full machine-readable stdout while redacting human-readable output", async () => {
  vi.stubEnv("EXAMPLE_SECRET", "1234567");
  const report = { heldMs: 332.123456799994, findings: "x".repeat(24000) };
  let stdout = "";
  let displayed = "";
  try {
    await command(
      process.execPath,
      ["-e", `process.stdout.write(${JSON.stringify(JSON.stringify(report))})`],
      process.cwd(),
      new AbortController().signal,
      (text) => {
        displayed += text;
      },
      10000,
      false,
      (text) => {
        stdout += text;
      },
    );
    expect(JSON.parse(stdout)).toEqual(report);
    expect(displayed).toContain("[redacted]");
    expect(displayed).not.toContain("1234567");
  } finally {
    vi.unstubAllEnvs();
  }
});
