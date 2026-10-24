import { randomUUID } from "node:crypto";
import type { Page } from "puppeteer-core";
import { z } from "zod";

const PointerEventSchema = z.object({
  at: z.number().finite(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  click: z.boolean(),
});
export type NativePointerEvent = z.infer<typeof PointerEventSchema>;

/** Chrome supplies the screen position, including its real window decorations. */
export function recordWindowPointer(binding: string) {
  const controller = new AbortController();
  const listener = {
    handleEvent(event: MouseEvent) {
      if (!event.isTrusted || outerWidth <= 0 || outerHeight <= 0) return;
      const x = (event.screenX - window.screenX) / outerWidth;
      const y = (event.screenY - window.screenY) / outerHeight;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      const send = (globalThis as unknown as Record<string, (value: NativePointerEvent) => void>)[
        binding
      ];
      void send({ at: Date.now(), x, y, click: event.type === "mousedown" });
    },
  };
  window.addEventListener("mousemove", listener, { capture: true, signal: controller.signal });
  window.addEventListener("mousedown", listener, { capture: true, signal: controller.signal });
  (globalThis as unknown as Record<string, unknown>)[`${binding}_stop`] = () => controller.abort();
}

/** Observe browser actions; OpenScreen owns interpolation, themes, and click effects. */
export async function collectBrowserPointerTrack(page: Page) {
  const binding = `__capturePointer_${randomUUID().replaceAll("-", "")}`;
  const events: NativePointerEvent[] = [];
  let startedAt = Infinity;
  await page.exposeFunction(binding, (value: unknown) => {
    const event = PointerEventSchema.parse(value);
    if (event.at >= startedAt) events.push(event);
  });
  const script = await page.evaluateOnNewDocument(recordWindowPointer, binding);
  // Navigations receive the same listener through evaluateOnNewDocument.
  for (const frame of page.frames()) await frame.evaluate(recordWindowPointer, binding);
  return {
    start(at: number) {
      startedAt = at;
    },
    async stop() {
      // Protocol round trip drains the action bindings before removing them.
      await page.evaluate(() => undefined);
      await page.removeScriptToEvaluateOnNewDocument(script.identifier);
      for (const frame of page.frames())
        await frame.evaluate((name) => {
          const scope = globalThis as unknown as Record<string, (() => void) | undefined>;
          scope[`${name}_stop`]?.();
          delete scope[`${name}_stop`];
        }, binding);
      await page.removeExposedFunction(binding);
      return events;
    },
  };
}
