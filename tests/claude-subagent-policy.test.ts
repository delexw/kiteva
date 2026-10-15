import { expect, it } from "vitest";
import { requireForegroundSubagent } from "../src/server/agents/claude-subagent-policy";

it.each(["Agent", "Task"])(
  "forces %s calls into the foreground and preserves their parameters",
  async (toolName) => {
    for (const background of [undefined, true, false]) {
      const toolInput = {
        prompt: "Read the supplied source",
        subagent_type: "reader",
        ...(background === undefined ? {} : { run_in_background: background }),
      };
      const result = await requireForegroundSubagent(
        {
          hook_event_name: "PreToolUse",
          session_id: "test",
          transcript_path: "/tmp/test",
          cwd: "/tmp",
          tool_name: toolName,
          tool_input: toolInput,
          tool_use_id: "call",
        },
        "call",
        { signal: new AbortController().signal },
      );
      expect(result).toEqual({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          updatedInput: { ...toolInput, run_in_background: false },
        },
      });
      expect(toolInput.run_in_background).toBe(background);
    }
  },
);

it("leaves other tools and their permission decisions alone", async () => {
  expect(
    await requireForegroundSubagent(
      {
        hook_event_name: "PreToolUse",
        session_id: "test",
        transcript_path: "/tmp/test",
        cwd: "/tmp",
        tool_name: "Bash",
        tool_input: { command: "pwd", run_in_background: true },
        tool_use_id: "call",
      },
      "call",
      { signal: new AbortController().signal },
    ),
  ).toEqual({});
});
