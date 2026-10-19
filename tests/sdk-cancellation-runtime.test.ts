import { expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Codex } from "@openai/codex-sdk";

it("the installed Codex SDK terminates its subprocess on abort without calling a model", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "sdk-abort-"));
  const controller = new AbortController();
  let childPid: number | undefined;
  try {
    const preload = path.join(folder, "sdk-test-process.mjs");
    await writeFile(
      preload,
      `process.stdout.write(JSON.stringify({type:'thread.started',thread_id:String(process.pid)})+'\\n');setInterval(()=>{},1000);process.stdin.resume();await new Promise(()=>{});\n`,
    );
    const client = new Codex({
      codexPathOverride: process.execPath,
      env: { NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` },
    });
    const { events } = await client
      .startThread({ skipGitRepoCheck: true })
      .runStreamed("Local cancellation probe", { signal: controller.signal });
    const running = (async () => {
      for await (const event of events) {
        if (event.type === "thread.started") {
          childPid = Number(event.thread_id);
          controller.abort();
        }
      }
    })();
    await expect(running).rejects.toThrow(/abort|signal/i);
    expect(childPid).toBeGreaterThan(0);
    await expect
      .poll(() => {
        try {
          process.kill(childPid!, 0);
          return true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
          throw error;
        }
      })
      .toBe(false);
    childPid = undefined;
  } finally {
    controller.abort();
    if (childPid) {
      try {
        process.kill(childPid, "SIGKILL");
      } catch {
        // The SDK may already have terminated the local probe.
      }
    }
    await rm(folder, { recursive: true, force: true });
  }
});
