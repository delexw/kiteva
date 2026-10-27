import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { mkdir, writeFile, symlink, rm } from "node:fs/promises";
import path from "node:path";
const fixture = vi.hoisted(() => ({ root: "" }));

vi.mock("../src/server/runtime/process", () => ({ command: vi.fn() }));
vi.mock("../src/server/runtime/config", async () => {
  const { mkdtempSync } = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  fixture.root ||= mkdtempSync(path.join(os.tmpdir(), "speech-setup-test-"));
  return {
    appRoot: path.resolve("."),
    dataRoot: fixture.root,
  };
});
vi.mock("../src/server/audio/providers/kokoro", () => ({ kokoroSpeechProvider: {} }));
vi.mock("../src/server/audio/providers/pocket-tts/chinese", () => ({
  pocketZhModelDirectory: "models",
  pocketZhSpeechProvider: {},
  pocketZhVoiceReference: vi.fn(),
}));
import { command } from "../src/server/runtime/process";
import { dataRoot } from "../src/server/runtime/config";

beforeEach(() => {
  vi.resetModules();
  vi.mocked(command).mockReset().mockRejectedValue(Error("stop after venv command"));
});
afterAll(() => rm(dataRoot, { recursive: true, force: true }));

it.each(["missing", "working", "broken"])(
  "only clears an existing broken Python environment (%s)",
  async (state) => {
    const environment = path.join(dataRoot, "pocket-tts-zh-venv");
    await rm(environment, { recursive: true, force: true });
    const python = path.join(
      environment,
      process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
    );
    if (state !== "missing") {
      await mkdir(path.dirname(python), { recursive: true });
      if (state === "working") await writeFile(python, "existing interpreter");
      else await symlink(path.join(dataRoot, "removed-python"), python);
    }
    await expect(import("../scripts/setup-pocket-tts-zh")).rejects.toThrow(
      "stop after venv command",
    );
    expect(vi.mocked(command).mock.calls[0][1]).toEqual([
      "-m",
      "venv",
      ...(state === "broken" ? ["--clear"] : []),
      environment,
    ]);
  },
);
