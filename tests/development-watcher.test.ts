import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createServer, normalizePath } from "vite";
import { expect, it, vi } from "vitest";
import configuration from "../vite.config";
import { dataRoot } from "../src/server/runtime/paths";
import { authoringSkillRoot } from "../src/server/agents/bundled-skills/installation";

it("ignores generated HTML and downloaded skills while keeping source hot reload active", async () => {
  const config = configuration({ command: "serve", mode: "development" });
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "development-watcher-")));
  const runtime = await mkdtemp(path.join(dataRoot, "watcher-check-"));
  const skill = await mkdtemp(path.join(authoringSkillRoot, ".watcher-check-"));
  const sourceFile = path.join(root, "index.html");
  const runtimeFile = path.join(runtime, "generated.html");
  const skillFile = path.join(skill, "example.html");
  await Promise.all([sourceFile, runtimeFile, skillFile].map((file) => writeFile(file, "before")));
  const server = await createServer({
    configFile: false,
    root,
    server: { host: "127.0.0.1", port: 0, watch: config.server?.watch },
  });
  const changed: string[] = [];
  const send = vi.spyOn(server.ws, "send");
  try {
    server.watcher.on("all", (_event, file) => changed.push(normalizePath(file)));
    server.watcher.add([runtime, skill]);
    await server.listen();
    await delay(300);
    changed.length = 0;
    send.mockClear();
    await Promise.all([runtimeFile, skillFile].map((file) => writeFile(file, "generated change")));
    await delay(300);
    expect(changed).not.toContain(normalizePath(runtimeFile));
    expect(changed).not.toContain(normalizePath(skillFile));
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "full-reload" }));

    await writeFile(sourceFile, "source change");
    await vi.waitFor(() => expect(changed).toContain(normalizePath(sourceFile)));
    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "full-reload" })),
    );
  } finally {
    await server.close();
    await Promise.all(
      [root, runtime, skill].map((folder) => rm(folder, { recursive: true, force: true })),
    );
  }
});
