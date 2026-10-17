import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { expect, it, vi } from "vitest";
import { z } from "zod";
const sdk = vi.hoisted(() => ({ query: vi.fn(), construct: vi.fn(), stream: vi.fn() }));
vi.mock("../src/server/agents/caveman", () => ({
  cavemanSettings: () => ({ enabled: false }),
  cavemanRuntime: async () => undefined,
}));
vi.mock("../src/server/agents/sdk-home", () => ({
  isolatedCodexHome: async () => "/isolated-home",
}));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: sdk.query }));
vi.mock("@openai/codex-sdk", () => ({
  Codex: class {
    constructor(options: unknown) {
      sdk.construct(options);
    }
    startThread() {
      return {
        runStreamed: async (prompt: string) => {
          sdk.stream(prompt);
          return {
            events: (async function* () {
              yield {
                type: "item.completed",
                item: { id: "answer", type: "agent_message", text: '{"ok":true}' },
              };
              yield { type: "turn.completed", usage: {} };
            })(),
          };
        },
      };
    }
  },
}));
import { agentTurn } from "../src/server/agents/providers";
import { anatomySkillPath } from "../src/server/agents/bundled-skills";

it.each(["claude", "codex"] as const)(
  "makes the local skill readable to %s without global settings or extra tools",
  async (provider) => {
    sdk.query.mockImplementation(async function* () {
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        structured_output: { ok: true },
        session_id: "session",
        usage: {},
        modelUsage: {},
      };
    });
    const workspace = await mkdtemp(path.join(os.tmpdir(), "provider-skills-"));
    try {
      const options = {
        provider,
        workspace,
        readOnly: true,
        schema: z.object({ ok: z.boolean() }),
        prompt: "Review this scene",
        signal: new AbortController().signal,
        onEvent: vi.fn(),
      };
      await agentTurn(options);
      expect(
        await readFile(path.join(workspace, anatomySkillPath, "kit/turn.mjs"), "utf8"),
      ).toContain("export");
      const prompt =
        provider === "claude"
          ? sdk.query.mock.calls.at(-1)![0].options.systemPrompt
          : sdk.stream.mock.calls.at(-1)![0];
      expect(prompt).toContain(`${anatomySkillPath}/SKILL.md`);
      if (provider === "claude") {
        expect(sdk.query.mock.calls.at(-1)![0].options.settingSources).toEqual([]);
        expect(sdk.query.mock.calls.at(-1)![0].options.tools).toEqual(["Read", "Glob", "Grep"]);
      } else expect(sdk.construct.mock.calls.at(-1)![0].config.project_doc_max_bytes).toBe(0);
      const textWorkspace = path.join(workspace, "text-only");
      await agentTurn({ ...options, workspace: textWorkspace, textOnly: true });
      await expect(
        readFile(path.join(textWorkspace, anatomySkillPath, "SKILL.md")),
      ).rejects.toThrow();
      const textPrompt =
        provider === "claude"
          ? sdk.query.mock.calls.at(-1)![0].options.systemPrompt
          : sdk.stream.mock.calls.at(-1)![0];
      expect(textPrompt).not.toContain("BUNDLED AUTHORING SKILL");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);
