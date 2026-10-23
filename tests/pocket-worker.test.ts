import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { PocketTtsWorker } from "../src/server/audio/providers/pocket-worker";

it("reuses one process across voices, resets after cancellation/crash and closes cleanly", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pocket-worker-test-"));
  const fixture = path.join(root, "worker.cjs");
  await writeFile(
    fixture,
    `const fs=require('fs');const readline=require('readline');
 fs.appendFileSync('starts.txt',process.pid+'\\n');
 readline.createInterface({input:process.stdin}).on('line',line=>{
 const r=JSON.parse(line);if(r.voice==='hang')return;if(r.voice==='crash')process.exit(2);
 fs.writeFileSync(r.output,JSON.stringify({pid:process.pid,voice:r.voice}));
 console.log(JSON.stringify({id:r.id,ok:true}));});`,
  );
  const worker = new PocketTtsWorker(process.execPath, [fixture], root);
  const synthesize = async (voice: string, signal = new AbortController().signal) => {
    const output = path.join(root, `${voice}.json`);
    await worker.synthesize({ textFile: "/unused", output, voice }, signal);
    return JSON.parse(await readFile(output, "utf8")) as { pid: number; voice: string };
  };
  try {
    const first = await synthesize("first");
    const second = await synthesize("second");
    expect(second.pid).toBe(first.pid);
    expect((await synthesize("first")).pid).toBe(first.pid);
    expect((await readFile(path.join(root, "starts.txt"), "utf8")).trim().split("\n")).toHaveLength(
      1,
    );
    const controller = new AbortController();
    const hung = synthesize("hang", controller.signal);
    controller.abort();
    await expect(hung).rejects.toThrow();
    expect((await synthesize("first")).pid).not.toBe(first.pid);
    await expect(synthesize("crash")).rejects.toThrow("exited");
    await expect(synthesize("second")).resolves.toMatchObject({ voice: "second" });
    worker.stop();
    await expect(synthesize("first")).resolves.toMatchObject({ voice: "first" });
  } finally {
    worker.stop();
    await rm(root, { recursive: true, force: true });
  }
});
