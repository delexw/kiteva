import type { Plugin } from "vite";
import type { createRoomDevelopmentApp } from "./dev-app.ts";
import { kitevaMcpPath } from "../../shared/kiteva-mcp.ts";

/** Serve room data during Vite development without restarting in-flight generation workers. */
export function roomDevelopmentApi(): Plugin {
  return {
    name: "kiteva-room-api",
    async configureServer(server) {
      const room = (await server.ssrLoadModule("/src/server/room/dev-app.ts")) as {
        createRoomDevelopmentApp: typeof createRoomDevelopmentApp;
      };
      const { app, close } = await room.createRoomDevelopmentApp();
      server.middlewares.use((request, response, next) => {
        if (
          request.url?.split("?")[0] !== kitevaMcpPath &&
          !request.url?.startsWith("/api/room") &&
          !/^\/api\/runs\/[^/]+\/activity\/children(?:\?|$)/.test(request.url || "")
        )
          return next();
        app.routing(request, response);
      });
      server.httpServer?.once("close", () => {
        void close();
      });
    },
  };
}
