import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { RequestSchema, type Run, type AgentProgressEvent } from "../src/shared/contracts";
import { formatModelPrompt } from "../src/shared/model-prompts";
import { ModelPromptTree, modelPromptTreeData } from "../src/client/governance/model-prompts";
import { recordedModelPrompt } from "../src/server/governance/prompts";
import { projectGovernance } from "../src/server/governance/report";
import { dataRoot } from "../src/server/runtime/config";
const run: Run = {
  id: "example",
  createdAt: "2026-01-01T00:00:00Z",
  request: RequestSchema.parse({ instructions: "Explain a simple idea" }),
  phase: "ready",
  jobs: [],
  candidates: [],
};
const event: AgentProgressEvent = {
  id: 1,
  runId: run.id,
  type: "invocation",
  time: run.createdAt,
  message: "Started",
  data: {
    provider: "claude",
    model: "example-model",
    invocationId: "call-1",
    purpose: "Review",
    prompt: {
      system: "Review supplied evidence",
      user: "Review the full supplied text.\n" + "x".repeat(18000),
      outputSchema: { type: "object" },
      reasoningEffort: "low",
    },
  },
};
it("retains complete prompt text and groups separate invocations beneath the model", async () => {
  const prompts = projectGovernance(run, [
    event,
    {
      ...event,
      id: 2,
      data: { ...(event.data as object), invocationId: "call-2", purpose: "Repair" },
    },
  ]).prompts!;
  expect(prompts).toHaveLength(2);
  expect(prompts.map((p) => p.id)).toEqual(["call-1", "call-2"]);
  const record = await recordedModelPrompt(run, [event], "call-1");
  expect(record?.user?.length).toBeGreaterThan(18000);
  expect(record?.reasoningEffort).toBe("low");
  const html = renderToStaticMarkup(<ModelPromptTree prompts={prompts} onSelect={() => {}} />);
  expect(html).toContain("2 prompts");
  const nodes = modelPromptTreeData(prompts);
  expect(nodes[0].children?.map((node) => node.title)).toEqual(["Review", "Repair"]);
  expect(nodes[0].children?.flatMap((node) => node.children?.map((call) => call.key))).toEqual([
    "call-1",
    "call-2",
  ]);
  expect(nodes[0].selectable).toBe(false);
});
it("redacts secrets without truncating recorded prompts and does not invent missing historical text", async () => {
  vi.stubEnv("EXAMPLE_SECRET", "private-value-123");
  try {
    const e = {
      ...event,
      data: {
        ...(event.data as object),
        prompt: {
          system: "private-value-123",
          user: "private-value-123" + "x".repeat(18000),
          outputSchema: null,
          reasoningEffort: "low",
        },
      },
    };
    const result = await recordedModelPrompt(run, [e], "call-1");
    expect(result?.system).toBe("[redacted]");
    expect(result?.user).not.toContain("private-value-123");
    expect(result?.user?.length).toBeGreaterThan(18000);
    const historical = {
      ...event,
      data: { provider: "codex", model: "example", invocationId: "old" },
    };
    expect(await recordedModelPrompt(run, [historical], "old")).toMatchObject({
      user: null,
      system: null,
      source: "historical",
    });
    expect(await recordedModelPrompt(run, [event], "unknown")).toBeUndefined();
  } finally {
    vi.unstubAllEnvs();
  }
});
it("recovers the correct historical user prompt within its invocation time window", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "prompt-history-"));
  const spy = vi.spyOn(os, "homedir").mockReturnValue(home);
  const session = "00000000-0000-4000-8000-000000000001";
  const workspace = path.join(dataRoot, "runs", run.id, "brief");
  try {
    const folder = path.join(home, ".claude", "projects", workspace.replace(/[^a-zA-Z0-9]/g, "-"));
    await mkdir(folder, { recursive: true });
    await writeFile(
      path.join(folder, `${session}.jsonl`),
      [
        {
          type: "user",
          timestamp: "2025-12-31T23:59:00Z",
          message: { content: "Earlier request" },
        },
        {
          type: "user",
          timestamp: "2026-01-01T00:00:01Z",
          message: { content: [{ type: "text", text: "Actual historical review" }] },
        },
        { type: "user", timestamp: "2026-01-01T00:01:01Z", message: { content: "Later repair" } },
      ]
        .map((e) => JSON.stringify(e))
        .join("\n"),
    );
    const events = [
      {
        ...event,
        data: { provider: "claude", model: "example", invocationId: "old", sessionId: session },
      },
      {
        ...event,
        id: 2,
        time: "2026-01-01T00:01:00Z",
        data: { provider: "claude", model: "example", invocationId: "later", sessionId: session },
      },
    ];
    expect(await recordedModelPrompt(run, events, "old")).toMatchObject({
      user: "Actual historical review",
      system: null,
      source: "historical",
    });
  } finally {
    spy.mockRestore();
    await rm(home, { recursive: true, force: true });
  }
});
it("formats complete JSON lines without removing or changing other prompt text", () => {
  expect(formatModelPrompt('RULES\n{"scene":1,"facts":["Keep exact copy"]}\nDo not guess.')).toBe(
    'RULES\n{\n  "scene": 1,\n  "facts": [\n    "Keep exact copy"\n  ]\n}\nDo not guess.',
  );
  expect(formatModelPrompt("Use {x} and [y] literally")).toBe("Use {x} and [y] literally");
});
