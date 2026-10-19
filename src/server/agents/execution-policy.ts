import { parse } from "shell-quote";
import { z } from "zod";

export const sdkExecutionGuidance =
  "SDK EXECUTION POLICY: Blender is disallowed in Kiteva agent sessions. Do not launch, probe, install or invoke Blender, its Python interpreter, bpy, Cycles or EEVEE, including through shell wrappers, subprocesses or scripts. Catalog or skill recommendations do not grant permission to use them. Use permitted local/code-based tools that preserve the requested result; if Blender is explicitly essential, report the capability limitation instead of attempting it or silently changing the requirement.";

export const blenderToolDenial =
  "Blender execution is disabled in Kiteva. Use permitted code-based tools, or report a capability limitation when Blender is essential.";

const HookInputSchema = z.object({
  hook_event_name: z.literal("PreToolUse"),
  tool_name: z.string(),
  tool_input: z.object({ command: z.union([z.string(), z.array(z.string())]) }),
});
const wrappers = new Set([
  "timeout",
  "gtimeout",
  "env",
  "sudo",
  "exec",
  "command",
  "nohup",
  "nice",
  "time",
  "xvfb-run",
]);
const shells = new Set([
  "sh",
  "bash",
  "zsh",
  "dash",
  "pwsh",
  "powershell",
  "powershell.exe",
  "cmd",
  "cmd.exe",
]);

export function invokesBlender(command: string): boolean {
  const tokens = parse(command, process.env);
  let executable = true;
  let shell = false;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (typeof token !== "string") {
      if ("op" in token && [";", "&&", "||", "|", "&", "("].includes(token.op)) {
        executable = true;
        shell = false;
      }
      continue;
    }
    if (shell && /^-(?:[a-z]*c|command)$|^\/c$/i.test(token)) {
      const script = tokens[index + 1];
      if (typeof script === "string" && invokesBlender(script)) return true;
    }
    if (!executable) continue;
    if (
      !token ||
      token.startsWith("-") ||
      /^\d+$/.test(token) ||
      /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)
    )
      continue;
    const name = token.split(/[\\/]/).at(-1)!.toLowerCase();
    if (/^blender(?:\.exe)?$/.test(name)) return true;
    if (wrappers.has(name)) continue;
    executable = false;
    shell = shells.has(name);
    if (/^(?:python[\d.]*|python[\d.]*\.exe)$/.test(name)) {
      const script = tokens[index + 2];
      if (
        tokens[index + 1] === "-c" &&
        typeof script === "string" &&
        /\b(?:import\s+bpy|from\s+bpy\b)|__import__\s*\(\s*['"]bpy['"]/.test(script)
      )
        return true;
    }
  }
  return false;
}

export function sdkToolHook(input: unknown) {
  try {
    const parsed = HookInputSchema.parse(input);
    if (!["Bash", "exec_command", "shell", "shell_command"].includes(parsed.tool_name)) return {};
    const commands = parsed.tool_input.command;
    const blocked =
      typeof commands === "string" ? invokesBlender(commands) : invokesBlender(commands.join(" "));
    if (!blocked) return {};
  } catch {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse" as const,
        permissionDecision: "deny" as const,
        permissionDecisionReason: "The command could not be inspected by Kiteva's tool policy.",
      },
    };
  }
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse" as const,
      permissionDecision: "deny" as const,
      permissionDecisionReason: blenderToolDenial,
    },
  };
}
