import { expect, it } from "vitest";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLocalReferenceBrowser } from "../src/server/jobs/subworkflows/website-reference";
import { projectRuntimeFiles } from "../src/server/runtime/project-files";
import { browserExecutablePath } from "../src/server/runtime/browser";

it.skipIf(!browserExecutablePath())(
  "uses separate project-local browser profiles and removes them after close",
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "project-browser-"));
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "text/html");
      response.end(`<!doctype html><title>Local demo</title><p id="owner"></p><script>
      const owner=new URLSearchParams(location.search).get('owner');
      if(!localStorage.getItem('owner'))localStorage.setItem('owner',owner);
      document.querySelector('#owner').textContent=localStorage.getItem('owner');
    </script>`);
    });
    const browsers: Awaited<ReturnType<typeof createLocalReferenceBrowser>>[] = [];
    try {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw Error("No server address");
      const url = `http://127.0.0.1:${address.port}`;
      const workspaces = [path.join(root, "a"), path.join(root, "b")];
      await Promise.all(workspaces.map((p) => mkdir(p)));
      const created = await Promise.all(
        workspaces.map((p) =>
          createLocalReferenceBrowser([url], AbortSignal.timeout(30000), "local", false, p),
        ),
      );
      browsers.push(...created);
      for (const [i, browser] of browsers.entries()) {
        await browser.inspect(`${url}/?owner=project-${i}`);
        const result = await browser.capture(path.join(workspaces[i], "frame.png"));
        expect(result.text).toBe(`project-${i}`);
        const profiles = await readdir(projectRuntimeFiles(workspaces[i], "browser").tmp);
        expect(profiles.filter((name) => name.startsWith("profile-"))).toHaveLength(1);
      }
      await Promise.all(browsers.map((browser) => browser.close()));
      browsers.length = 0;
      for (const workspace of workspaces)
        expect(await readdir(projectRuntimeFiles(workspace, "browser").tmp)).toEqual([]);
    } finally {
      await Promise.all(browsers.map((browser) => browser.close()));
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await rm(root, { recursive: true, force: true });
    }
  },
  45000,
);
