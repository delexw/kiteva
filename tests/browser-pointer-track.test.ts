import { afterEach, expect, it, vi } from "vitest";
import { recordWindowPointer } from "../src/server/capture/browser-pointer-track";

afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const handlers = new Map<string, { handleEvent(event: MouseEvent): void }>();
  const send = vi.fn();
  const window = {
    screenX: -1200,
    screenY: 140,
    addEventListener: (type: string, handler: { handleEvent(event: MouseEvent): void }) =>
      handlers.set(type, handler),
  };
  vi.stubGlobal("window", window);
  vi.stubGlobal("outerWidth", 1000);
  vi.stubGlobal("outerHeight", 750);
  vi.stubGlobal("pointerTest", send);
  recordWindowPointer("pointerTest");
  const click = (values: Partial<MouseEvent> = {}) =>
    handlers.get("mousedown")!.handleEvent({
      isTrusted: true,
      type: "mousedown",
      screenX: -950,
      screenY: 372,
      clientX: 250,
      clientY: 200,
      ...values,
    } as MouseEvent);
  return { click, send, window };
}

it("uses actual screen positions with window decorations, negative display origins and window moves", () => {
  const { click, send, window } = fixture();
  click();
  expect(send).toHaveBeenLastCalledWith({
    at: expect.any(Number),
    x: 0.25,
    y: 232 / 750,
    click: true,
  });
  window.screenX = 100;
  window.screenY = 250;
  click({ screenX: 350, screenY: 482 });
  expect(send).toHaveBeenLastCalledWith({
    at: expect.any(Number),
    x: 0.25,
    y: 232 / 750,
    click: true,
  });
});

it("excludes synthetic DOM events and points outside the recorded window", () => {
  const { click, send } = fixture();
  click({ isTrusted: false });
  click({ screenX: -1201 });
  click({ screenY: 891 });
  expect(send).not.toHaveBeenCalled();
});
