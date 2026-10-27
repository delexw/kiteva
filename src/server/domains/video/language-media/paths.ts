import path from "node:path";
export function languageMediaPaths(workspace: string) {
  return {
    folder: path.join(workspace, "audio", "languages"),
    base: path.join(workspace, "renders", "full.music.mp4"),
  };
}
