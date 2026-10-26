import { randomUUID } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import path from "node:path";

/** Give each OpenScreen process its own persistent stderr file, including failed starts. */
export async function openCaptureDiagnostics(directory: string) {
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `openscreen-${randomUUID()}.log`);
  const handle = await open(file, "wx", 0o600);
  return { path: file, fd: handle.fd, close: () => handle.close() };
}
