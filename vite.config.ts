import { roomDevelopmentApi } from "./src/server/room/dev-plugin.ts";
import { dataRoot } from "./src/server/runtime/paths.ts";
import { authoringSkillRoot } from "./src/server/agents/bundled-skills/installation.ts";
import tailwindcss from "@tailwindcss/vite";
import { browserAliases } from "./vite.resolve.ts";
import { defineConfig, loadEnv, normalizePath } from "vite";
import { resolveLocalPorts } from "./src/shared/local-ports.ts";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const ports = resolveLocalPorts({
    ...loadEnv(mode, process.cwd(), "VIDEO_AGENT_"),
    ...process.env,
  });
  return {
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
      port: ports.web,
      strictPort: true,
      // Generated project files and downloaded skills are not application source.
      watch: { ignored: [dataRoot, authoringSkillRoot].map((root) => `${normalizePath(root)}/**`) },
      proxy: { "/api": `http://127.0.0.1:${ports.backend}` },
    },
  };
});
