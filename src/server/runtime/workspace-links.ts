import { copyFile, symlink } from "node:fs/promises";

/** Junctions do not require Windows Developer Mode or symlink privileges. */
export async function linkWorkspaceDirectory(source: string, destination: string) {
  await symlink(source, destination, process.platform === "win32" ? "junction" : "dir").catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    },
  );
}

/** Refresh credential/session copies on Windows, where file links require extra privileges. */
export async function linkSdkFile(source: string, destination: string) {
  if (process.platform === "win32") {
    await copyFile(source, destination);
    return;
  }
  await symlink(source, destination, "file").catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
}
