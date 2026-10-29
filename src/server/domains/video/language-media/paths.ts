import { workspacePaths } from "../../../runtime/workspace";
import path from "node:path";
export function languageMediaPaths(workspace: string) {
  const paths = workspacePaths(workspace);
  return {
    folder: path.join(workspace, paths.languageMedia),
    context: path.join(workspace, paths.languageContext),
    base: path.join(workspace, paths.renders, "full.music.mp4"),
  };
}
