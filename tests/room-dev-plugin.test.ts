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

it("routes read-only activity branches locally without intercepting build or event-stream requests", async () => {
  const routing = vi.fn(),
    next = vi.fn();
  let middleware:
    | ((request: { url?: string }, response: object, next: () => void) => void)
    | undefined;
  const server = {
    ssrLoadModule: async () => ({
      createRoomDevelopmentApp: async () => ({ app: { routing }, close: vi.fn() }),
    }),
    middlewares: {
      use: (handler: NonNullable<typeof middleware>) => {
        middleware = handler;
      },
    },
    httpServer: { once: vi.fn() },
  };
  const configure = roomDevelopmentApi().configureServer;
  if (typeof configure !== "function") throw Error("Missing hook");
  await Reflect.apply(configure, {}, [server]);
  if (!middleware) throw Error("Missing middleware");
  const response = {};
  const request = { url: "/api/runs/project/activity/children?jobId=version&path=1.2" };
  middleware(request, response, next);
  expect(routing).toHaveBeenCalledWith(request, response);
  expect(next).not.toHaveBeenCalled();
  for (const url of [
    "/api/runs/project/events",
    "/api/runs/project/refine",
    "/api/runs/project/activity",
    "/api/runs/project/activity/children-other",
  ]) {
    middleware({ url }, response, next);
  }
  expect(next).toHaveBeenCalledTimes(4);
});
