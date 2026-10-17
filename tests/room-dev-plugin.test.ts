import { expect, it, vi } from "vitest";
import { roomDevelopmentApi } from "../src/server/room/dev-plugin";

it("keeps room routes local while speech status, samples and generation pass to the backend proxy", async () => {
  const routing = vi.fn();
  const close = vi.fn();
  let middleware:
    | ((request: { url?: string }, response: object, next: () => void) => void)
    | undefined;
  const server = {
    ssrLoadModule: vi.fn(async () => ({
      createRoomDevelopmentApp: async () => ({ app: { routing }, close }),
    })),
    middlewares: {
      use: (handler: NonNullable<typeof middleware>) => {
        middleware = handler;
      },
    },
    httpServer: { once: vi.fn() },
  };
  const configure = roomDevelopmentApi().configureServer;
  if (typeof configure !== "function") throw Error("Missing development server hook");
  await Reflect.apply(configure, {}, [server]);
  if (!middleware) throw Error("Missing room middleware");
  const response = {};
  for (const url of [
    "/api/speech/status?engine=pocket-tts",
    "/api/speech/sample",
    "/api/speech/samples/example",
    "/api/runs",
    "/api/setup",
  ]) {
    const next = vi.fn();
    middleware({ url }, response, next);
    expect(next).toHaveBeenCalledOnce();
  }
  expect(routing).not.toHaveBeenCalled();
  const next = vi.fn();
  const roomRequest = { url: "/api/room/library" };
  middleware(roomRequest, response, next);
  expect(routing).toHaveBeenCalledWith(roomRequest, response);
  expect(next).not.toHaveBeenCalled();
});
