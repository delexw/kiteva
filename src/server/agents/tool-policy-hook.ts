import { sdkToolHook, blenderToolDenial } from "./execution-policy";

let input = "";
for await (const chunk of process.stdin) input += String(chunk);
try {
  process.stdout.write(JSON.stringify(sdkToolHook(JSON.parse(input))));
} catch {
  // A malformed command must not turn the policy check into permission to execute.
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `${blenderToolDenial} The command could not be inspected.`,
      },
    }),
  );
}
