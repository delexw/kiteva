import { createCaptureWorker } from "../src/server/capture/worker-server";

if (process.platform !== "darwin" && process.platform !== "win32")
  throw Error("Unattended OpenScreen workers currently require a macOS or Windows desktop");
if (process.env.KITEVA_CAPTURE_DESKTOP !== "1")
  throw Error("Start this worker only on an isolated desktop with KITEVA_CAPTURE_DESKTOP=1");
if (!process.env.OPENSCREEN_EXECUTABLE || !process.env.VIDEO_BROWSER_PATH)
  throw Error("Set OPENSCREEN_EXECUTABLE and VIDEO_BROWSER_PATH on the isolated desktop");
const app = createCaptureWorker(process.env.KITEVA_CAPTURE_WORKER_TOKEN ?? "");
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await app.close();
}
process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});
await app.listen({
  port: Number(process.env.KITEVA_CAPTURE_WORKER_PORT ?? 4330),
  host: "127.0.0.1",
});
