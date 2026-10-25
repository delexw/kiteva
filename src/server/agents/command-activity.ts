import type { ToolActivity } from "../../shared/tool-activity";
import path from "node:path";
import { parse } from "shell-quote";

/** Classify explicit commands only; never infer installation from prose or script names. */
export function commandActivity(command: string, depth = 0): ToolActivity | undefined {
  if (depth > 3) return undefined;
  try {
    const tokens = parse(command);
    let words: string[] = [];
    let selected: ToolActivity | undefined;
    const priority: Record<ToolActivity, number> = {
      reading: 1,
      editing: 2,
      checking: 3,
      bundling: 4,
      dependencies: 5,
    };
    const select = (activity: ToolActivity | undefined) => {
      if (activity && (!selected || priority[activity] > priority[selected])) selected = activity;
    };
    const classify = () => {
      while (words[0] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) words.shift();
      const executable = path.basename(words[0] ?? "");
      const args = words.slice(1);
      if (["sh", "bash", "zsh"].includes(executable) && /^-[a-z]*c$/.test(args[0] ?? "") && args[1])
        return commandActivity(args[1], depth + 1);
      if (
        (["npm", "pnpm", "yarn", "bun"].includes(executable) &&
          ["install", "i", "ci", "add"].includes(args[0] ?? "")) ||
        (/^pip(?:\d+(?:\.\d+)*)?$/.test(executable) && args[0] === "install") ||
        (/^python(?:\d+(?:\.\d+)*)?$/.test(executable) &&
          args[0] === "-m" &&
          args[1] === "pip" &&
          args[2] === "install") ||
        (executable === "uv" &&
          (args[0] === "add" ||
            args[0] === "sync" ||
            (args[0] === "pip" && args[1] === "install"))) ||
        (executable === "cargo" && args[0] === "install")
      )
        return "dependencies" as const;
      if (
        executable === "esbuild" ||
        (["vite", "rollup", "webpack", "parcel"].includes(executable) && args.includes("build")) ||
        (["npx", "bunx"].includes(executable) && args[0] === "esbuild")
      )
        return "bundling" as const;
      if (["cat", "head", "tail", "ls", "rg", "grep", "find", "pwd"].includes(executable))
        return "reading" as const;
      if (["touch", "cp", "mv", "mkdir"].includes(executable)) return "editing" as const;
      if (
        (executable === "node" && args.includes("--check")) ||
        (["npm", "pnpm", "yarn", "bun"].includes(executable) &&
          (args[0] === "test" ||
            (args[0] === "run" && ["test", "lint", "check", "typecheck"].includes(args[1] ?? ""))))
      )
        return "checking" as const;
      return undefined;
    };
    for (const token of tokens) {
      if (typeof token === "string") words.push(token);
      else if ("op" in token && [";", "&&", "||", "|", "&"].includes(token.op)) {
        const activity = classify();
        select(activity);
        words = [];
      }
    }
    select(classify());
    return selected;
  } catch {
    return undefined;
  }
}
