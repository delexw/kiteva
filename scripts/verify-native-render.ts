import { createServer, createConnection } from "node:net";
import { lookup } from "node:dns/promises";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { appRoot, dataRoot } from "../src/server/runtime/config";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { command, isolatedCommand } from "../src/server/runtime/process";
import { renderJob } from "../src/server/rendering/render";

if (process.argv.includes("--windows") && process.platform !== "win32")
  throw Error("Run windows:check in native Windows PowerShell, not macOS or WSL.");
import {
  withWindowsSandboxVerification,
  clearWindowsRenderVerification,
  recordWindowsRenderVerification,
} from "../src/server/rendering/sandbox/readiness";
async function verifyNativeRender() {
  const signal = AbortSignal.timeout(300000);
  const root = path.join(dataRoot, "native-check", randomUUID());
  const workspace = path.join(root, "workspace");
  const privateFolder = path.join(dataRoot, "runtime", "codex", `native-probe-${randomUUID()}`);
  const privateFile = path.join(privateFolder, "probe.txt");
  const outsideFile = path.join(root, "outside.txt");
  const server = createServer((socket) => {
    socket.on("error", () => {});
    socket.end("local probe");
  });
  try {
    await mkdir(workspace, { recursive: true });
    await mkdir(privateFolder, { recursive: true });
    await writeFile(privateFile, "This is a fake credential used only to test read denial.");
    if (!browserExecutablePath())
      throw Error(
        "Install Chrome headless shell or set VIDEO_BROWSER_PATH before running this check.",
      );
    await command("ffmpeg", ["-version"], workspace, signal);
    await command("ffprobe", ["-version"], workspace, signal);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "0.0.0.0", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw Error("Could not start local network probe");
    const host = (await lookup("example.com", { family: 4 })).address;
    const remotePort = 443;
    // Prove this public endpoint is reachable outside the sandbox before testing denial.
    // No HTTP request, credentials or user content is sent.
    await new Promise<void>((resolve, reject) => {
      const socket = createConnection({ host, port: remotePort });
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", reject);
      socket.setTimeout(5000, () => {
        socket.destroy();
        reject(
          Error(
            "Public TCP probe is unreachable outside the sandbox; network denial cannot be verified",
          ),
        );
      });
    });
    const probe = `
const fs=require('node:fs');const net=require('node:net');
const canConnect=(host,port)=>new Promise(resolve=>{const s=net.createConnection({host,port});let done=false;const finish=v=>{if(done)return;done=true;s.destroy();resolve(v)};s.once('connect',()=>finish(true));s.once('error',()=>finish(false));s.setTimeout(1200,()=>finish(false));});
(async()=>{const [privateFile,outsideFile,host,port,remotePort]=process.argv.slice(1);let privateDenied=false,outsideDenied=false;try{fs.readFileSync(privateFile)}catch{privateDenied=true}try{fs.writeFileSync(outsideFile,'forbidden')}catch{outsideDenied=true}fs.writeFileSync('workspace-write.txt','allowed');console.log(JSON.stringify({privateDenied,outsideDenied,loopbackAllowed:await canConnect('127.0.0.1',Number(port)),remoteDenied:!(await canConnect(host,Number(remotePort)))}));})().catch(e=>{console.error(e);process.exitCode=1});`;
    let stdout = "";
    await isolatedCommand(
      process.execPath,
      ["-e", probe, privateFile, outsideFile, host, String(address.port), String(remotePort)],
      workspace,
      signal,
      () => {},
      90000,
      (text) => {
        stdout += text;
      },
    );
    const result = JSON.parse(stdout);
    if (
      !["privateDenied", "outsideDenied", "loopbackAllowed", "remoteDenied"].every(
        (key) => result[key] === true,
      )
    )
      throw Error(`Native sandbox boundary check failed: ${JSON.stringify(result)}`);
    if ((await readFile(path.join(workspace, "workspace-write.txt"), "utf8")) !== "allowed")
      throw Error("Workspace write check failed");
    console.log(
      "Native sandbox: workspace writes and loopback work; private reads, outside writes and direct remote connections are blocked.",
    );
    const cancelled = new AbortController();
    const tickFile = path.join(workspace, "ticks.txt");
    let cancelError: unknown;
    const pending = isolatedCommand(
      process.execPath,
      [
        "-e",
        "const fs=require('node:fs');let n=0;setInterval(()=>fs.writeFileSync('ticks.txt',String(++n)),50)",
      ],
      workspace,
      cancelled.signal,
      () => {},
      90000,
    ).catch((error) => {
      cancelError = error;
    });
    try {
      for (let attempt = 0; attempt < 600; attempt++) {
        signal.throwIfAborted();
        if (cancelError) throw cancelError;
        const ticks = await readFile(tickFile, "utf8").catch(() => "");
        if (Number(ticks) >= 2) break;
        await delay(100, undefined, { signal });
      }
      if (Number(await readFile(tickFile, "utf8")) < 2)
        throw Error("Native cancellation probe did not start");
    } finally {
      cancelled.abort();
      await pending;
    }
    if (!(cancelError instanceof Error) || cancelError.message !== "Cancelled")
      throw Error("Native command did not report cancellation");
    await delay(200, undefined, { signal });
    const stopped = await readFile(tickFile, "utf8");
    await delay(500, undefined, { signal });
    if ((await readFile(tickFile, "utf8")) !== stopped)
      throw Error("Native command kept running after cancellation");
    console.log("Native cancellation stopped the owned command tree.");
    await copyFile(
      path.join(appRoot, "node_modules/gsap/dist/gsap.min.js"),
      path.join(workspace, "gsap.min.js"),
    );
    await writeFile(
      path.join(workspace, "index.html"),
      `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#171717}main{width:640px;height:360px;position:relative;overflow:hidden}#block{position:absolute;left:50px;top:140px;width:80px;height:80px;background:#FFB23E}</style></head><body><main data-composition-id="native-check" data-width="640" data-height="360" data-duration="1" data-fps="30"><div id="block"></div></main><script src="gsap.min.js"></script><script>const tl=gsap.timeline({paused:true});tl.to('#block',{x:400,duration:1,ease:'none'},0);window.__timelines={'native-check':tl};</script></body></html>`,
    );
    const output = await renderJob(
      {
        id: "native-check",
        runId: "native-check",
        candidateId: "native-check",
        kind: "preview",
        phase: "rendering",
        workspace,
        model: "local-check",
        duration: 1,
      },
      {
        pipeline: "HyperFrames",
        fallbackReason: null,
        styleRenderer: ["HTML/CSS"],
        motionEngine: ["GSAP"],
        sourceFile: "index.html",
        duration: 1,
        width: 640,
        height: 360,
        audioDescription: "Silent",
        limitations: [],
      },
      signal,
      (type, message) => {
        if (type !== "render_progress") console.log(message);
      },
    );
    console.log(
      `Native ${process.platform} renderer check passed (${output.video}). No model calls were made.`,
    );
  } finally {
    server.close();
    await rm(privateFolder, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
}
await withWindowsSandboxVerification(async () => {
  if (process.platform === "win32") await clearWindowsRenderVerification();
  await verifyNativeRender();
  if (process.platform === "win32") await recordWindowsRenderVerification();
});
