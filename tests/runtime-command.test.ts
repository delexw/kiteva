import { credentialEnvironmentVariables } from "../src/server/runtime/credential-environment";
import { afterEach, expect, it, vi } from "vitest";
import { appRoot } from "../src/server/runtime/config";
import { command } from "../src/server/runtime/process";
afterEach(() => vi.unstubAllEnvs());
it("keeps machine-readable stdout intact while redacting the display channel", async () => {
  const fake = "fixture-not-a-real-api-key";
  vi.stubEnv(credentialEnvironmentVariables.anthropicApiKey, fake);
  let stdout = "";
  const display = await command(
    process.execPath,
    ["-e", "process.stdout.write(JSON.stringify({value:process.env.TEST_VALUE,text:'中文'}))"],
    appRoot,
    new AbortController().signal,
    () => {},
    10000,
    false,
    (text) => {
      stdout += text;
    },
    { TEST_VALUE: fake },
  );
  expect(JSON.parse(stdout)).toEqual({ value: fake, text: "中文" });
  expect(display).toContain("[redacted]");
  expect(display).not.toContain(fake);
});
it("cancels an owned subprocess and reports a timeout separately", async () => {
  const keepAlive = ["-e", "setInterval(()=>{},1000)"];
  await expect(
    command(process.execPath, keepAlive, appRoot, AbortSignal.timeout(150), () => {}, 10000),
  ).rejects.toThrow("Cancelled");
  await expect(
    command(process.execPath, keepAlive, appRoot, new AbortController().signal, () => {}, 150),
  ).rejects.toThrow("Process exceeded time limit");
});
it("rejects an already-cancelled operation before launch", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    command(process.execPath, ["-e", "process.exit(0)"], appRoot, controller.signal),
  ).rejects.toThrow();
});

it("decodes UTF-8 characters split across stdout chunks", async () => {
  let stdout = "";
  await command(
    process.execPath,
    [
      "-e",
      "const bytes=Buffer.from('中文');process.stdout.write(bytes.subarray(0,1));setTimeout(()=>process.stdout.write(bytes.subarray(1)),80)",
    ],
    appRoot,
    new AbortController().signal,
    () => {},
    10000,
    false,
    (text) => {
      stdout += text;
    },
  );
  expect(stdout).toBe("中文");
});

it("waits for stubborn detached descendants to exit and preserves unrelated processes", async () => {
  const { spawn } = await import("node:child_process");
  const controller = new AbortController();
  const unrelated = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
    stdio: "ignore",
  });
  const owned: number[] = [];
  const exists = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
      throw error;
    }
  };
  const childCode = "process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)";
  const parentCode = `
    const {spawn}=require('node:child_process');
    process.on('SIGTERM',()=>{});
    const child=spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{detached:true,stdio:['ignore','pipe','ignore']});
    child.stdout.once('data',()=>console.log(JSON.stringify([process.pid,child.pid])));
    setInterval(()=>{},1000);
  `;
  try {
    let stdout = "";
    await expect(
      command(
        process.execPath,
        ["-e", parentCode],
        appRoot,
        controller.signal,
        () => {},
        10000,
        false,
        (chunk) => {
          stdout += chunk;
          if (stdout.includes("\n")) {
            owned.push(...JSON.parse(stdout.trim()));
            controller.abort();
          }
        },
      ),
    ).rejects.toThrow("Cancelled");
    expect(owned).toHaveLength(2);
    expect(owned.map(exists)).toEqual([false, false]);
    expect(exists(unrelated.pid!)).toBe(true);
  } finally {
    for (const pid of [...owned, unrelated.pid])
      if (pid && exists(pid)) process.kill(pid, "SIGKILL");
  }
}, 15000);
