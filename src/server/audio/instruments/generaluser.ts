import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { instrumentSoundFontDirectory } from "./fluidsynth";

// Inspected upstream release 2.0.3; fixed revision and byte hashes make setup reproducible.
export const generalUserRevision = "684543d5e5efaef08d02be50dcda8d552478fa60";
const files = [
  {
    source: "GeneralUser-GS.sf2",
    name: "GeneralUser-GS.sf2",
    sha256: "9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe",
  },
  {
    source: "documentation/LICENSE.txt",
    name: "LICENSE.txt",
    sha256: "7b32efefdf95ce38a043799f0659853ddc00fbaa14d8c50f0aca16b9b8b405be",
  },
] as const;
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export async function installGeneralUser(
  signal: AbortSignal,
  directory = instrumentSoundFontDirectory,
  request: typeof fetch = fetch,
) {
  await mkdir(directory, { recursive: true });
  if (!(await lstat(directory)).isDirectory())
    throw Error("SoundFont directory must not be a link");
  const scratch = await mkdtemp(path.join(directory, ".setup-"));
  try {
    for (const file of files) {
      const destination = path.join(directory, file.name);
      const current = await lstat(destination).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
      if (current && !current.isFile()) throw Error("SoundFont files must not be links");
      if (current && digest(await readFile(destination)) === file.sha256) continue;
      const response = await request(
        `https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/${generalUserRevision}/${file.source}`,
        { redirect: "error", signal },
      );
      if (!response.ok) throw Error(`SoundFont download returned HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (digest(bytes) !== file.sha256) throw Error(`SoundFont checksum mismatch: ${file.name}`);
      await writeFile(path.join(scratch, file.name), bytes, { flag: "wx" });
    }
    signal.throwIfAborted();
    for (const file of files) {
      const temporary = path.join(scratch, file.name);
      if (await lstat(temporary).catch(() => undefined))
        await rename(temporary, path.join(directory, file.name));
    }
    return directory;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
