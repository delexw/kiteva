import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { Store } from "../jobs/store";
import { registerRoomRoutes } from "./routes";
import { assetLimits } from "../../shared/asset-limits";
import { apiErrorHandler } from "../runtime/api-errors";
import { registerSpeechRoutes } from "../audio/routes";

export async function createRoomDevelopmentApp() {
  const store = new Store();
  const app = Fastify({ bodyLimit: 26_000_000 });
  app.setErrorHandler(apiErrorHandler);
  await app.register(multipart, { limits: { fileSize: assetLimits.audio.bytes, files: 1 } });
  await registerRoomRoutes(app, store);
  registerSpeechRoutes(app);
  await app.ready();
  return { app, close: () => app.close().finally(() => store.close()) };
}
