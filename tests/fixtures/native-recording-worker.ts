import { mkdir } from "node:fs/promises";
import { once } from "node:events";
import { createLocalReferenceBrowser } from "../../src/server/jobs/subworkflows/website-reference";
import { referenceToolRegistry } from "../../src/server/agents/capabilities/reference-browser/tool-registry";

const [url, workspace] = process.argv.slice(2);
await mkdir(workspace, { recursive: true });
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 90000);
process.on("message", (command) => {
  if (command === "cancel") controller.abort();
});
let browser: Awaited<ReturnType<typeof createLocalReferenceBrowser>> | undefined;
let result: Record<string, string | number | boolean> = {
  ok: false,
  error: "Builder did not complete",
};
try {
  browser = await createLocalReferenceBrowser([url], controller.signal, "local", true);
  const view = await browser.inspect(url);
  const button = view.controls.find((control) => control.name === "Run test");
  if (!button) throw Error("Fixture control missing");
  await browser.perform(
    {
      operation: "browser_emulate",
      ...referenceToolRegistry.browser_emulate.schema.parse({
        action: "viewport",
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
      }),
    },
    workspace,
  );
  process.send?.({ ready: true });
  const [command] = await once(process, "message", { signal: controller.signal });
  if (command !== "start") throw Error("Recording cancelled before start");
  const id = await browser.startRecording(workspace);
  const started = Date.now();
  await browser.click(button.id);
  await browser.wait(1000);
  await browser.prepareRecording(id);
  const stopped = Date.now();
  await browser.editRecording(id, { operation: "getCurrentDocument" });
  const frames = await browser.editRecording(id, {
    operation: "getFrames",
    arguments: { atSec: [0.5] },
  });
  if (frames.isError || !frames.content.some((part) => part.type === "image"))
    throw Error("Native frame review failed");
  const video = await browser.exportRecording(id);
  result = { ok: true, started, stopped, duration: video.duration, assetPath: video.assetPath };
} catch (error) {
  result = { ok: false, error: String(error) };
} finally {
  await browser?.close();
  clearTimeout(timer);
  process.send?.(result);
  process.disconnect();
}
