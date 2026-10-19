import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";

it.skipIf(!browserExecutablePath())(
  "fills and clicks using the backend's actual tsx loader",
  async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["--import", "tsx", "tests/fixtures/reference-browser-runtime.ts"],
      { timeout: 30000 },
    );
    expect(JSON.parse(stdout)).toMatchObject({
      fill: "passed",
      click: "passed",
      centeredBeforeTyping: true,
      backgroundTrafficDoesNotDelayReadyControls: true,
    });
  },
);
