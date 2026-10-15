import viteConfig from "./vite.config.ts";
import { defineConfig } from "vitest/config";
export default defineConfig(async (environment) => {
  const resolvedViteConfig = await viteConfig(environment);
  return {
    resolve: resolvedViteConfig.resolve,
    test: { include: ["tests/**/*.test.{ts,tsx}"], testTimeout: 15000 },
  };
});
