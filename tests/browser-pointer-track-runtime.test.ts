import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("installs the tsx-transformed listener in an isolated browser execution context", async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    "--import",
    "tsx",
    "--input-type=module",
    "-e",
    `import { runInNewContext } from "node:vm";
import { recordWindowPointer } from "./src/server/capture/browser-pointer-track.ts";
const handlers = new Map();
const events = [];
let signal;
const context = {
  AbortController,
  window: {
    screenX: -1200, screenY: 140,
    addEventListener(type, handler, options) {
      handlers.set(type, handler);
      signal = options.signal;
    },
  },
  outerWidth: 1000, outerHeight: 750,
  pointerTest(event) { events.push(event); },
};
runInNewContext('(' + recordWindowPointer.toString() + ')("pointerTest")', context);
handlers.get("mousedown").handleEvent({
  isTrusted: true, type: "mousedown", screenX: -950, screenY: 372,
});
context.pointerTest_stop();
console.log(JSON.stringify({ events, aborted: signal.aborted }));`,
  ]);
  expect(JSON.parse(stdout)).toEqual({
    events: [{ at: expect.any(Number), x: 0.25, y: 232 / 750, click: true }],
    aborted: true,
  });
});
