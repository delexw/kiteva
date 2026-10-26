import { expect, it } from "vitest";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { withProcessScope } from "../src/server/runtime/process-scope";

it("isolates concurrent process owners and aborts dependencies launched internally", async () => {
  const first = new AbortController();
  const second = new AbortController();
  const children: Array<ReturnType<typeof spawn>> = [];
  const run = (controller: AbortController) =>
    withProcessScope(controller.signal, async (signal) => {
      const child = spawn(
        process.execPath,
        ["-e", "process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)"],
        { signal },
      );
      children.push(child);
      child.on("error", () => {});
      await once(child.stdout!, "data");
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
    });
  const a = run(first);
  const b = run(second);
  const rejectedA = expect(a).rejects.toThrow();
  const rejectedB = expect(b).rejects.toThrow();
  try {
    await Promise.all(children.map((child) => once(child.stdout!, "data")));
    first.abort();
    await rejectedA;
    expect(children[0].exitCode !== null || children[0].signalCode !== null).toBe(true);
    expect(children[1].exitCode).toBeNull();
    expect(children[1].signalCode).toBeNull();
    second.abort();
    await rejectedB;
  } finally {
    first.abort();
    second.abort();
    await Promise.allSettled([a, b]);
  }
}, 15000);

it("keeps a factory's returned process owned until the resource is closed", async () => {
  const { createProcessScope } = await import("../src/server/runtime/process-scope");
  const scope = createProcessScope(new AbortController().signal);
  const child = await scope.run(async (signal) => {
    const process = spawn(
      globalThis.process.execPath,
      ["-e", "process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)"],
      { signal },
    );
    process.on("error", () => {});
    return process;
  });
  try {
    await once(child.stdout!, "data");
    expect(child.exitCode).toBeNull();
    await scope.close();
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    await scope.close();
  } finally {
    await scope.close();
  }
}, 15000);
