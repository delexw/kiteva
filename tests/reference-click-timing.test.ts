import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";

vi.mock("node:timers/promises", async (original) => {
  const timers = await original<typeof import("node:timers/promises")>();
  return { ...timers, setTimeout: vi.fn(timers.setTimeout) };
});
vi.mock("../src/server/jobs/subworkflows/website-capture", () => ({
  startWebsiteCapture: vi.fn(),
}));
import { startWebsiteCapture } from "../src/server/jobs/subworkflows/website-capture";
import { createLocalReferenceBrowser } from "../src/server/jobs/subworkflows/website-reference";

it.skipIf(!browserExecutablePath())(
  "clicks after pointer arrival without adding a fixed dwell",
  async () => {
    const events: Array<{ kind: string; time: number }> = [];
    vi.mocked(startWebsiteCapture).mockResolvedValue({
      id: randomUUID(),
      cursor: (_x, _y, kind) => {
        events.push({ kind, time: performance.now() });
      },
      prepare: vi.fn(),
      edit: vi.fn(),
      export: vi.fn(),
      close: vi.fn(async () => {}),
    });
    const web = createServer((_request, response) => {
      response.setHeader("content-type", "text/html");
      response.end(
        "<h1>Ready</h1><button onclick=\"document.querySelector('h1').textContent='Clicked'\">Next</button>",
      );
    });
    await new Promise<void>((resolve) => web.listen(0, "127.0.0.1", resolve));
    const address = web.address();
    if (!address || typeof address === "string") throw Error("No test server address");
    const url = `http://127.0.0.1:${address.port}`;
    const browser = await createLocalReferenceBrowser(
      [url],
      new AbortController().signal,
      "local",
      false,
    );
    try {
      const page = await browser.inspect(url);
      await browser.startRecording("/unused-timing-fixture");
      vi.mocked(delay).mockClear();
      expect(
        (await browser.click(page.controls.find((control) => control.name === "Next")!.id)).text,
      ).toContain("Clicked");
      const click = events.find((event) => event.kind === "click")!;
      const arrival = events.filter((event) => event.kind === "move").at(-1)!;
      expect(click.time).toBeGreaterThanOrEqual(arrival.time);
      expect(events.map((event) => event.kind)).toEqual([...Array(12).fill("move"), "click"]);
      expect(vi.mocked(delay).mock.calls.map(([milliseconds]) => milliseconds)).toEqual(
        Array(12).fill(16),
      );
    } finally {
      await browser.close();
      await new Promise<void>((resolve) => web.close(() => resolve()));
      vi.restoreAllMocks();
    }
  },
);
