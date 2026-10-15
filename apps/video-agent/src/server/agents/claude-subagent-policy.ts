import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";

export const requireForegroundSubagent: HookCallback = async (input) => {
  if (input.hook_event_name !== "PreToolUse" || !["Agent", "Task"].includes(input.tool_name))
    return {};

  if (!input.tool_input || typeof input.tool_input !== "object" || Array.isArray(input.tool_input))
    throw new Error("Subagent tool input must be an object");

  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      updatedInput: { ...input.tool_input, run_in_background: false },
    },
  };
};
