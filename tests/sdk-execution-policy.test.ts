import { expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import TOML from "@iarna/toml";
import { sdkToolHook } from "../src/server/agents/execution-policy";
import { prepareCodexToolHook } from "../src/server/agents/codex-tool-hooks";

it.each([
  "blender --background --python scene.py",
  "/Applications/Blender.app/Contents/MacOS/Blender -b",
  'timeout 90 /Applications/Blender.app/Contents/MacOS/Blender -b --python-expr "import bpy"',
  "node prepare.js && blender -b",
  "env EXAMPLE=1 blender -b",
  "bash -lc 'blender -b'",
  '"C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" -b',
  "python -c 'import bpy; print(bpy.app.version_string)'",
])("denies the Blender tool call before execution: %s", (command) => {
  expect(
    sdkToolHook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } }),
  ).toMatchObject({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: expect.stringContaining("Blender execution is disabled"),
    },
  });
});

it.each([
  "node render.js",
  "ffmpeg -i capture.webm output.mp4",
  "python create_tiles.py",
  "cat brief.json",
  "echo 'Blender is disabled'",
])("leaves normal tool permissions unchanged: %s", (command) => {
  expect(
    sdkToolHook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } }),
  ).toEqual({});
});

it("denies malformed shell inputs instead of failing open", () => {
  expect(
    sdkToolHook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {} }),
  ).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
});

it("the command hook entry point returns the native deny response", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      import.meta.resolve("tsx"),
      fileURLToPath(new URL("../src/server/agents/tool-policy-hook.ts", import.meta.url)),
    ],
    {
      input: JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "blender -b" },
      }),
      encoding: "utf8",
      timeout: 10000,
    },
  );
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    hookSpecificOutput: { permissionDecision: "deny" },
  });
});

it("installs and verifies only the application-owned hook in the isolated Codex home", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "sdk-hook-"));
  try {
    await prepareCodexToolHook(home);
    const config = TOML.parse(await readFile(path.join(home, "config.toml"), "utf8"));
    expect(config).toMatchObject({
      features: { hooks: true },
      hooks: { state: expect.any(Object) },
    });
    expect(config).not.toHaveProperty("default_permissions");
    const hooks = JSON.parse(await readFile(path.join(home, "hooks.json"), "utf8"));
    expect(hooks.hooks.PreToolUse[0].matcher).toBe("^Bash$");
    expect(hooks.hooks.PreToolUse[0].hooks[0].command).toContain("tool-policy-hook.ts");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
