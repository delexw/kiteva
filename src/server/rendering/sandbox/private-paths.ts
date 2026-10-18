import path from "node:path";
import { appRoot, dataRoot } from "../../runtime/config";
import { userHome } from "../../runtime/platform";

export function renderPrivatePaths() {
  return [
    ...new Set(
      [
        ...[".codex", ".claude", ".ssh", ".aws", ".config"].map((name) =>
          path.join(userHome(), name),
        ),
        process.env.CODEX_HOME,
        process.env.CLAUDE_CONFIG_DIR,
        path.join(dataRoot, "runtime", "codex"),
        path.join(dataRoot, "runtime", "render-sandbox"),
        path.join(appRoot, ".env"),
        path.join(appRoot, ".env.local"),
      ].filter((file): file is string => Boolean(file)),
    ),
  ];
}
