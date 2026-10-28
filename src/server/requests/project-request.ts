import { applyLanguageTracks } from "../../shared/language-tracks";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { CreativeRequest } from "../../shared/contracts";

/** Keep each stage's request inside its own permitted workspace. */
export async function writeProjectRequest(workspace: string, request: CreativeRequest) {
  const file = path.resolve(workspace, "PROJECT_REQUEST.json");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify(
      { request: request.outputType === "video" ? applyLanguageTracks(request) : request },
      null,
      2,
    ),
  );
  return file;
}
