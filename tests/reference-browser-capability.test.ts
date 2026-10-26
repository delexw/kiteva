import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { agentCapabilities } from "../src/server/agents/capabilities/registry";
import { referenceBrowserCapability } from "../src/server/agents/capabilities/reference-browser/capability";
import { enabledReferenceTools } from "../src/server/agents/capabilities/reference-browser/types";
import { contextRecoveryCapabilities } from "../src/server/agents/capabilities/context-recovery/capability";
import { browserExecutablePath } from "../src/server/runtime/browser";

it.each([
  { readOnly: true, enableVideoCapture: true, recording: false },
  { readOnly: false, enableVideoCapture: false, recording: false },
  { readOnly: false, enableVideoCapture: true, recording: true },
  { readOnly: false, enableVideoCapture: undefined, recording: true },
])("registers browser permissions through the capability registry: %j", (stage) => {
  const options = {
    ...stage,
    referenceUrls: ["https://example.com"],
    captureChapterId: "example-chapter",
    captureChapterDurationSeconds: 12,
  };
  const { servers, guidance } = agentCapabilities(
    "/tmp/example-job",
    stage.readOnly,
    false,
    true,
    options,
  );
  const capability = servers.reference_browser;
  expect(capability.enabledTools).toEqual(enabledReferenceTools(!stage.recording));
  expect(capability.toolTimeoutSeconds).toBe(600);
  expect(JSON.parse(capability.args.at(-1)!)).toMatchObject({
    enableVideoCapture: stage.recording,
    captureChapterId: "example-chapter",
    captureChapterDurationSeconds: 12,
  });
  expect(guidance).toContain("WEBSITE REFERENCE EXPLORATION");
  expect(capability.enabledTools.includes("capture_video")).toBe(stage.recording);
});

it("omits browser registration and guidance without URLs or during text-only turns", () => {
  expect(referenceBrowserCapability("/tmp/example-job", {})).toBeUndefined();
  expect(referenceBrowserCapability("/tmp/example-job", { referenceUrls: [] })).toBeUndefined();
  expect(
    agentCapabilities("/tmp/example-job", false, true, true, {
      referenceUrls: ["https://example.com"],
    }),
  ).toEqual({ servers: {}, guidance: "" });
  expect(agentCapabilities("/tmp/example-job").guidance).not.toContain(
    "WEBSITE REFERENCE EXPLORATION",
  );
});

it("registers optional context recovery without taking ownership of its provider proxy", () => {
  expect(contextRecoveryCapabilities(undefined)).toEqual({});
  const mcp = {
    command: "example-context-server",
    args: [],
    env: { CAVEMAN_HOME: "/tmp/example-context" },
  };
  expect(
    contextRecoveryCapabilities({
      url: "http://127.0.0.1:9999",
      env: { CAVEMAN_HOME: "/tmp/example-context" },
      mcp,
    }),
  ).toEqual({
    caveman: { ...mcp, enabledTools: ["caveman_retrieve"], toolTimeoutSeconds: 60 },
  });
});

it.skipIf(!browserExecutablePath())(
  "starts the migrated MCP entrypoint and inspects a real browser page",
  async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["--import", "tsx", "tests/fixtures/reference-browser-capability-runtime.ts"],
      { timeout: 25000 },
    );
    expect(JSON.parse(stdout)).toEqual({ discovery: "passed", inspection: "passed", toolCount: 9 });
  },
  30000,
);
