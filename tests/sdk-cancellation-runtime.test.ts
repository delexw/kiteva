import { expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { withProcessScope } from "../src/server/runtime/process-scope";
import { Codex } from "@openai/codex-sdk";

it("the installed Codex SDK terminates its subprocess on abort without calling a model", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "sdk-abort-"));
  const controller = new AbortController();
  let childPid: number | undefined;
  let dependencyPid: number | undefined;
  try {
    const preload = path.join(folder, "sdk-test-process.mjs");
    await writeFile(
      preload,
      `import {spawn} from 'node:child_process';
const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)"],{detached:true,env:{...process.env,NODE_OPTIONS:''},stdio:['ignore','pipe','ignore']});
child.stdout.once('data',()=>process.stdout.write(JSON.stringify({type:'thread.started',thread_id:process.pid+':'+child.pid})+'\\n'));
setInterval(()=>{},1000);process.stdin.resume();await new Promise(()=>{});\n`,
    );
    const client = new Codex({
      codexPathOverride: process.execPath,
      env: { NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` },
    });
    const running = withProcessScope(controller.signal, async (signal) => {
      const { events } = await client
        .startThread({ skipGitRepoCheck: true })
        .runStreamed("Local cancellation probe", { signal });
      for await (const event of events) {
        if (event.type === "thread.started") {
          [childPid, dependencyPid] = event.thread_id.split(":").map(Number);
          controller.abort();
        }
      }
    });
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
    expect(dependencyPid).toBeGreaterThan(0);
    expect(() => process.kill(dependencyPid!, 0)).toThrow();
    childPid = undefined;
    dependencyPid = undefined;
  } finally {
    controller.abort();
    for (const pid of [childPid, dependencyPid])
      if (pid) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // The SDK may already have terminated the local probe.
        }
      }
    await rm(folder, { recursive: true, force: true });
  }
});

it("the installed Claude SDK cleans up its detached dependency on caller abort without a model call", async () => {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const { spawn } = await import("node:child_process");
  const { readFile } = await import("node:fs/promises");
  const folder = await mkdtemp(path.join(os.tmpdir(), "sdk-scope-"));
  const controller = new AbortController();
  let pids: number[] = [];
  const fixture = path.join(folder, "fixture.cjs");
  const marker = path.join(folder, "ready.json");
  await writeFile(
    fixture,
    `
    const {spawn}=require('node:child_process');
    const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)"],{detached:true,stdio:['ignore','pipe','ignore']});
    child.stdout.once('data',()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},JSON.stringify([process.pid,child.pid])));
    process.stdin.resume();setInterval(()=>{},1000);
  `,
  );
  const running = withProcessScope(controller.signal, async (signal) => {
    const abortController = new AbortController();
    const abort = () => abortController.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    const stream = query({
      prompt: "Local cancellation probe",
      options: {
        cwd: folder,
        abortController,
        settingSources: [],
        spawnClaudeCodeProcess: () =>
          spawn(process.execPath, [fixture], { stdio: ["pipe", "pipe", "inherit"] }),
      },
    });
    try {
      for await (const _event of stream) signal.throwIfAborted();
    } finally {
      signal.removeEventListener("abort", abort);
      stream.close();
    }
  });
  const rejected = expect(running).rejects.toThrow();
  try {
    await expect
      .poll(async () => {
        try {
          pids = JSON.parse(await readFile(marker, "utf8"));
          return pids.length;
        } catch {
          return 0;
        }
      })
      .toBe(2);
    controller.abort();
    await rejected;
    for (const pid of pids) expect(() => process.kill(pid, 0)).toThrow();
  } finally {
    controller.abort();
    await running.catch(() => {});
    for (const pid of pids) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
    await rm(folder, { recursive: true, force: true });
  }
}, 15000);
