import { browserAliases } from "./vite.resolve.ts";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: browserAliases },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    testTimeout: 15000,
    pool: "threads",
    // Workflow mocks and environment changes must stay scoped to each test file.
    isolate: true,
  },
});
