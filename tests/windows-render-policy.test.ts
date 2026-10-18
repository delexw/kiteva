import { withWindowsSandboxVerification } from "../src/server/rendering/sandbox/readiness";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "@iarna/toml";
import { expect, it } from "vitest";
import {
  renderPermissionProfile,
  windowsRenderCommand,
  windowsRenderPolicy,
  windowsRenderSandboxHome,
  sandboxConfigOverrides,
} from "../src/server/rendering/sandbox/windows";
const diagnosticCommand = (...args: Parameters<typeof windowsRenderCommand>) =>
  withWindowsSandboxVerification(() => windowsRenderCommand(...args));
it("serializes real Windows paths and grants writes only to workspace, render home and temporary files", () => {
  const workspace = 'C:\\Projects\\my app "notes"';
  const home = "C:\\app\\render-home";
  const denied = ["C:\\app\\.env", "C:\\Users\\Creator\\.ssh"];
  const policy = parse(windowsRenderPolicy(workspace, home, denied));
  expect(policy.windows).toEqual({ sandbox: "elevated" });
  const permissions = policy.permissions as Record<
    string,
    { filesystem: Record<string, string>; network: Record<string, unknown> }
  >;
  const profile = permissions[renderPermissionProfile];
  expect(profile.filesystem[workspace]).toBe("write");
  expect(profile.filesystem[home]).toBe("write");
  expect(profile.filesystem[":root"]).toBe("read");
  for (const file of denied) expect(profile.filesystem[file]).toBe("deny");
  expect(profile.network).toMatchObject({
    enabled: true,
    mode: "limited",
    allow_local_binding: true,
    domains: { localhost: "allow", "127.0.0.1": "allow", "::1": "allow" },
  });
});
it("uses separate policy files and literal argv, with no provider login or shell command", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "native-render-"));
  const first = await diagnosticCommand(
    process.execPath,
    ["-e", 'console.log("a & b")'],
    workspace,
  );
  const second = await withWindowsSandboxVerification(() =>
    windowsRenderCommand(process.execPath, ["-e", "0"], workspace),
  );
  try {
    const payload = (args: string[]) =>
      JSON.parse(Buffer.from(args.at(-1)!, "base64url").toString("utf8"));
    const firstPayload = payload(first.args);
    expect(first.executable).toBe(process.execPath);
    expect(first.args[0]).toBe("--import");
    expect(firstPayload.command).toEqual([process.execPath, "-e", 'console.log("a & b")']);
    expect(firstPayload.configOverrides).toEqual(payload(second.args).configOverrides);
    expect(first.env.CODEX_HOME).toBe(windowsRenderSandboxHome);
    expect(firstPayload.configOverrides.join("\n")).toContain(".env.local");
    expect(firstPayload.configOverrides.join("\n")).not.toContain("api_key");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

it("keeps paths with dots, equals signs and quotes literal through CLI overrides", () => {
  const policy = windowsRenderPolicy('C:\\user.name\\my = "project"', "C:\\render-home", [
    "C:\\private.name\\.env",
  ]);
  expect(parse(sandboxConfigOverrides(policy).join("\n"))).toEqual(parse(policy));
  expect(parse(policy).features).toMatchObject({
    network_proxy: { enabled: true, mode: "limited", allow_local_binding: true },
  });
});
it("protects custom provider homes on both render backends", async () => {
  const { renderPrivatePaths } = await import("../src/server/rendering/sandbox/private-paths");
  const previous = process.env.CODEX_HOME;
  process.env.CODEX_HOME = "/custom/provider-home";
  try {
    expect(renderPrivatePaths()).toContain("/custom/provider-home");
  } finally {
    if (previous === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previous;
  }
});
