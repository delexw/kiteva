import { createHash } from "node:crypto";
import path from "node:path";
import { hasProjectLayout, workspaceOwner, workspacePaths } from "../runtime/workspace";

/** Child speech tasks retain separate checkpoints while publishing media in the owning project. */
export function speechWorkspacePaths(workspace: string) {
  const owner = workspaceOwner(workspace);
  const paths = workspacePaths(owner);
  const relative = path.relative(owner, path.resolve(workspace));
  const scope =
    hasProjectLayout(owner) && relative ? createHash("sha256").update(relative).digest("hex") : "";
  return {
    media: path.join(owner, paths.speech, scope),
    context: path.join(owner, paths.speechContext, scope),
  };
}
