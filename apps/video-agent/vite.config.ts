import { roomDevelopmentApi } from "./src/server/room/dev-plugin.ts";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { DEFAULT_WEB_PORT } from "./src/shared/local-web-port.ts";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  plugins: [roomDevelopmentApi(), react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src/client", import.meta.url)) } },
  build: { outDir: "dist/client" },
  server: {
    host: "127.0.0.1",
    port: Number(
      loadEnv(mode, process.cwd(), "VIDEO_AGENT_").VIDEO_AGENT_WEB_PORT || DEFAULT_WEB_PORT,
    ),
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4317" },
  },
}));
