import { roomDevelopmentApi } from "./src/server/room/dev-plugin.ts";
import tailwindcss from "@tailwindcss/vite";
import { browserAliases } from "./vite.resolve.ts";
import { defineConfig, loadEnv } from "vite";
import { DEFAULT_WEB_PORT } from "./src/shared/local-web-port.ts";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  plugins: [roomDevelopmentApi(), react(), tailwindcss()],
  resolve: { alias: browserAliases },
  build: {
    outDir: "dist/client",
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
        // Entry-aware group names can exceed Windows path limits; hashes keep asset paths short.
        chunkFileNames: "assets/[hash].js",
        // Keep large shared dependencies cacheable without pulling lazy features into the entry.
        codeSplitting: {
          groups: [
            {
              name: "vendor",
              test: /node_modules[\\/]/,
              entriesAware: true,
              maxSize: 300_000,
            },
            {
              name: "application",
              test: /src[\\/]/,
              tags: ["$initial"],
              entriesAware: true,
              maxSize: 300_000,
            },
          ],
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: Number(
      loadEnv(mode, process.cwd(), "VIDEO_AGENT_").VIDEO_AGENT_WEB_PORT || DEFAULT_WEB_PORT,
    ),
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4317" },
  },
}));
