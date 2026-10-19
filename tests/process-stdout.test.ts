import { expect, it, vi } from "vitest";
import { command } from "../src/server/runtime/process";

it.each(["display", "stdout"])(
  "rejects %s callback failures without crashing the backend",
  async (channel) => {
    const failure = Error("Progress persistence failed");
    const fail = () => {
      throw failure;
    };
    await expect(
      command(
        process.execPath,
        ["-e", "process.stdout.write('progress');setInterval(() => {}, 1000)"],
        process.cwd(),
        new AbortController().signal,
        channel === "display" ? fail : () => {},
        10000,
        false,
        channel === "stdout" ? fail : () => {},
      ),
    ).rejects.toBe(failure);
    // A subsequent command still works after the failed child is stopped.
    await expect(
      command(
        process.execPath,
        ["-e", "process.stdout.write('ok')"],
        process.cwd(),
        new AbortController().signal,
      ),
    ).resolves.toBe("ok");
  },
);

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
